import {
  getPlayerRoute,
  getRouteNode,
  getSpecialMove,
  type BoardDefinition,
  type BoardNodeId,
  type SpecialMoveDefinition,
} from "./board.js";
import {
  getActivePlayer,
  type ClassicGameState,
  type GameEvent,
  type GameTransition,
} from "./game-state.js";
import type { ClassicRuleset } from "./classic-ruleset.js";
import type { PieceId, PieceState, PlayerId, PlayerState } from "./types.js";

export function createInitialClassicGameState(
  playerIds: readonly PlayerId[],
  board: BoardDefinition,
  ruleset: ClassicRuleset,
): ClassicGameState {
  if (playerIds.length !== ruleset.config.playerCount) {
    throw new Error(
      `Expected ${ruleset.config.playerCount} players, received ${playerIds.length}.`,
    );
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error("Player IDs must be unique.");
  }

  const players = playerIds.map((playerId): PlayerState => {
    const route = getPlayerRoute(board, playerId);
    return {
      id: playerId,
      pieces: Array.from(
        { length: ruleset.config.piecesPerPlayer },
        (_, index): PieceState => ({
          id: `${playerId}-plane-${index + 1}`,
          ownerId: playerId,
          zone: "base",
          routeIndex: null,
          distanceToFinish: route.nodeIds.length - 1,
        }),
      ),
    };
  });

  return {
    players,
    phase: "awaiting-roll",
    activePlayerIndex: 0,
    pendingRoll: null,
    consecutiveSpecialRolls: 0,
    turnNumber: 1,
    winnerId: null,
  };
}

/**
 * Applies a server-generated dice result. Clients must never choose this value.
 */
export function applyDiceRoll(
  state: ClassicGameState,
  playerId: PlayerId,
  roll: number,
  board: BoardDefinition,
  ruleset: ClassicRuleset,
): GameTransition {
  assertPhase(state, "awaiting-roll");
  assertActivePlayer(state, playerId);
  assertDiceRoll(roll);

  const activePlayer = getActivePlayer(state);
  const isSpecialRoll = ruleset.config.extraRollOn.includes(roll);
  const consecutiveSpecialRolls = isSpecialRoll
    ? state.consecutiveSpecialRolls + 1
    : 0;
  const events: GameEvent[] = [{ type: "dice-rolled", playerId, roll }];

  const penalty = ruleset.consecutiveRoll.evaluate({
    playerId,
    consecutiveSpecialRolls,
    pieces: activePlayer.pieces,
  });

  if (penalty.turnEnds) {
    let penalizedState: ClassicGameState = {
      ...state,
      consecutiveSpecialRolls,
    };

    if (penalty.pieceIdToReturn) {
      penalizedState = updatePiece(
        penalizedState,
        playerId,
        penalty.pieceIdToReturn,
        (piece) => returnPieceToBase(piece, board),
      );
      events.push({
        type: "piece-returned-to-base",
        playerId,
        pieceId: penalty.pieceIdToReturn,
        reason: "third-special-roll",
      });
    }

    return advanceTurn(penalizedState, events);
  }

  const legalPieceIds = getLegalPieceIds(state, playerId, roll, board, ruleset);
  if (legalPieceIds.length === 0) {
    events.push({ type: "no-legal-move", playerId, roll });
    return advanceTurn({ ...state, consecutiveSpecialRolls }, events);
  }

  return {
    state: {
      ...state,
      phase: "awaiting-piece",
      pendingRoll: roll,
      consecutiveSpecialRolls,
    },
    events,
  };
}

export function applyPieceSelection(
  state: ClassicGameState,
  playerId: PlayerId,
  pieceId: PieceId,
  board: BoardDefinition,
  ruleset: ClassicRuleset,
): GameTransition {
  assertPhase(state, "awaiting-piece");
  assertActivePlayer(state, playerId);
  const roll = state.pendingRoll;
  if (roll === null) {
    throw new Error("A piece cannot move without a pending dice roll.");
  }

  const legalPieceIds = getLegalPieceIds(state, playerId, roll, board, ruleset);
  if (!legalPieceIds.includes(pieceId)) {
    throw new Error(`Piece ${pieceId} is not legal for roll ${roll}.`);
  }

  const player = getActivePlayer(state);
  const piece = findPiece(player, pieceId);
  const events: GameEvent[] = [];
  let nextState = state;

  if (piece.zone === "base") {
    const route = getPlayerRoute(board, playerId);
    const nodeId = route.nodeIds[0];
    if (!nodeId) {
      throw new Error(`Player ${playerId} has an empty route.`);
    }
    nextState = updatePiece(nextState, playerId, pieceId, () =>
      pieceAtRouteIndex(piece, 0, board),
    );
    events.push({ type: "piece-taken-off", playerId, pieceId, nodeId });
  } else {
    const movement = planMovement(nextState, piece, roll, board, ruleset);
    nextState = updatePiece(nextState, playerId, pieceId, () =>
      pieceAtRouteIndex(piece, movement.destinationIndex, board),
    );
    events.push({
      type: "piece-moved",
      playerId,
      pieceId,
      fromNodeId: movement.fromNodeId,
      toNodeId: movement.toNodeId,
      traversedNodeIds: movement.traversedNodeIds,
    });
    if (movement.blockadeNodeId) {
      events.push({
        type: "movement-blocked",
        playerId,
        pieceId,
        blockadeNodeId: movement.blockadeNodeId,
        stoppedAtNodeId: movement.toNodeId,
      });
    }
  }

  const movedPiece = findPiece(
    nextState.players[nextState.activePlayerIndex]!,
    pieceId,
  );
  const collisionResult = resolveLandingCollisions(
    nextState,
    movedPiece,
    board,
  );
  nextState = collisionResult.state;
  events.push(...collisionResult.events);

  if (movedPiece.zone === "track") {
    const specialResult = resolveSpecialLanding(
      nextState,
      movedPiece,
      board,
      ruleset,
    );
    nextState = specialResult.state;
    events.push(...specialResult.events);
  }

  if (ruleset.victory.hasWon(nextState, playerId)) {
    events.push({ type: "game-ended", winnerId: playerId });
    return {
      state: {
        ...nextState,
        phase: "ended",
        pendingRoll: null,
        winnerId: playerId,
      },
      events,
    };
  }

  if (ruleset.config.extraRollOn.includes(roll)) {
    return {
      state: {
        ...nextState,
        phase: "awaiting-roll",
        pendingRoll: null,
      },
      events,
    };
  }

  return advanceTurn(nextState, events);
}

export function getLegalPieceIds(
  state: ClassicGameState,
  playerId: PlayerId,
  roll: number,
  board: BoardDefinition,
  ruleset: ClassicRuleset,
): readonly PieceId[] {
  assertActivePlayer(state, playerId);
  assertDiceRoll(roll);
  const player = getActivePlayer(state);

  return player.pieces
    .filter((piece) => {
      if (piece.zone === "finished") return false;
      if (piece.zone === "base") return ruleset.takeoff.canTakeOff(roll);
      planMovement(state, piece, roll, board, ruleset);
      return true;
    })
    .map((piece) => piece.id);
}

interface PlannedMovement {
  readonly destinationIndex: number;
  readonly fromNodeId: BoardNodeId;
  readonly toNodeId: BoardNodeId;
  readonly traversedNodeIds: readonly BoardNodeId[];
  readonly blockadeNodeId: BoardNodeId | null;
}

function planMovement(
  state: ClassicGameState,
  piece: PieceState,
  roll: number,
  board: BoardDefinition,
  ruleset: ClassicRuleset,
): PlannedMovement {
  if (piece.routeIndex === null || piece.zone === "base") {
    throw new Error(`Piece ${piece.id} is not on a route.`);
  }

  const route = getPlayerRoute(board, piece.ownerId);
  const lastIndex = route.nodeIds.length - 1;
  const pathIndices = buildBouncingPath(piece.routeIndex, roll, lastIndex);
  let destinationIndex = piece.routeIndex;
  let blockadeNodeId: BoardNodeId | null = null;
  const traversedNodeIds: BoardNodeId[] = [];

  for (const routeIndex of pathIndices) {
    const nodeId = route.nodeIds[routeIndex]!;
    if (
      ruleset.config.stacksBlockMovement &&
      isOpponentBlockade(state, piece.ownerId, nodeId, board)
    ) {
      blockadeNodeId = nodeId;
      break;
    }
    destinationIndex = routeIndex;
    traversedNodeIds.push(nodeId);
  }

  return {
    destinationIndex,
    fromNodeId: route.nodeIds[piece.routeIndex]!,
    toNodeId: route.nodeIds[destinationIndex]!,
    traversedNodeIds,
    blockadeNodeId,
  };
}

function buildBouncingPath(
  startIndex: number,
  steps: number,
  finishIndex: number,
): readonly number[] {
  const indices: number[] = [];
  let current = startIndex;
  let direction = 1;

  for (let step = 0; step < steps; step += 1) {
    if (current === finishIndex) direction = -1;
    if (current === 0) direction = 1;
    current += direction;
    indices.push(current);
  }

  return indices;
}

function isOpponentBlockade(
  state: ClassicGameState,
  movingPlayerId: PlayerId,
  nodeId: BoardNodeId,
  board: BoardDefinition,
): boolean {
  const node = board.nodes[nodeId];
  if (!node || node.safe || node.kind !== "track") return false;

  for (const player of state.players) {
    if (player.id === movingPlayerId) continue;
    const piecesOnNode = player.pieces.filter(
      (piece) => getPieceNodeId(piece, board) === nodeId,
    ).length;
    if (piecesOnNode >= 2) return true;
  }
  return false;
}

function resolveLandingCollisions(
  state: ClassicGameState,
  movedPiece: PieceState,
  board: BoardDefinition,
): GameTransition {
  const nodeId = getPieceNodeId(movedPiece, board);
  if (!nodeId) return { state, events: [] };
  const node = board.nodes[nodeId];
  if (!node || node.safe || node.kind !== "track") {
    return { state, events: [] };
  }

  let nextState = state;
  const events: GameEvent[] = [];
  for (const player of state.players) {
    if (player.id === movedPiece.ownerId) continue;
    for (const piece of player.pieces) {
      if (getPieceNodeId(piece, board) !== nodeId) continue;
      nextState = updatePiece(nextState, player.id, piece.id, (current) =>
        returnPieceToBase(current, board),
      );
      events.push({
        type: "piece-returned-to-base",
        playerId: player.id,
        pieceId: piece.id,
        reason: "collision",
      });
    }
  }
  return { state: nextState, events };
}

function resolveSpecialLanding(
  state: ClassicGameState,
  movedPiece: PieceState,
  board: BoardDefinition,
  ruleset: ClassicRuleset,
): GameTransition {
  const startNodeId = getPieceNodeId(movedPiece, board);
  if (!startNodeId) return { state, events: [] };

  const directFlight = getSpecialMove(
    board,
    movedPiece.ownerId,
    startNodeId,
    "flight",
  );
  if (directFlight) {
    const flightResult = applySpecialMove(
      state,
      movedPiece,
      directFlight,
      board,
      ruleset,
    );
    if (!flightResult.taken) return flightResult.transition;

    const afterFlight = findPieceByOwner(
      flightResult.transition.state,
      movedPiece.ownerId,
      movedPiece.id,
    );
    const jumpAfterFlight = getSpecialMove(
      board,
      movedPiece.ownerId,
      directFlight.toNodeId,
      "color-jump",
    );
    if (!jumpAfterFlight) return flightResult.transition;

    const jumpResult = applySpecialMove(
      flightResult.transition.state,
      afterFlight,
      jumpAfterFlight,
      board,
      ruleset,
    );
    return {
      state: jumpResult.transition.state,
      events: [
        ...flightResult.transition.events,
        ...jumpResult.transition.events,
      ],
    };
  }

  const colorJump = getSpecialMove(
    board,
    movedPiece.ownerId,
    startNodeId,
    "color-jump",
  );
  if (!colorJump) return { state, events: [] };

  const jumpResult = applySpecialMove(
    state,
    movedPiece,
    colorJump,
    board,
    ruleset,
  );
  if (!jumpResult.taken) return jumpResult.transition;

  // A color jump may land on the flight entry. It flies across the board but
  // does not receive a second color jump afterwards.
  const flightAfterJump = getSpecialMove(
    board,
    movedPiece.ownerId,
    colorJump.toNodeId,
    "flight",
  );
  if (!flightAfterJump) return jumpResult.transition;

  const afterJump = findPieceByOwner(
    jumpResult.transition.state,
    movedPiece.ownerId,
    movedPiece.id,
  );
  const flightResult = applySpecialMove(
    jumpResult.transition.state,
    afterJump,
    flightAfterJump,
    board,
    ruleset,
  );
  return {
    state: flightResult.transition.state,
    events: [
      ...jumpResult.transition.events,
      ...flightResult.transition.events,
    ],
  };
}

function applySpecialMove(
  state: ClassicGameState,
  piece: PieceState,
  move: SpecialMoveDefinition,
  board: BoardDefinition,
  ruleset: ClassicRuleset,
): { readonly taken: boolean; readonly transition: GameTransition } {
  if (ruleset.config.stacksBlockMovement) {
    const blockingNodeId = [...move.viaNodeIds, move.toNodeId].find((nodeId) =>
      isOpponentBlockade(state, piece.ownerId, nodeId, board),
    );
    if (blockingNodeId) {
      return {
        taken: false,
        transition: {
          state,
          events: [
            {
              type: "special-move-blocked",
              playerId: piece.ownerId,
              pieceId: piece.id,
              kind: move.kind,
              fromNodeId: move.fromNodeId,
              blockingNodeId,
            },
          ],
        },
      };
    }
  }

  const route = getPlayerRoute(board, piece.ownerId);
  const destinationIndex = route.nodeIds.indexOf(move.toNodeId);
  if (destinationIndex < 0) {
    throw new Error(`Special move destination is outside ${piece.ownerId}'s route.`);
  }

  let nextState = updatePiece(state, piece.ownerId, piece.id, () =>
    pieceAtRouteIndex(piece, destinationIndex, board),
  );
  const events: GameEvent[] = [
    {
      type: "special-move-taken",
      playerId: piece.ownerId,
      pieceId: piece.id,
      kind: move.kind,
      fromNodeId: move.fromNodeId,
      toNodeId: move.toNodeId,
      viaNodeIds: move.viaNodeIds,
    },
  ];

  for (const nodeId of move.viaNodeIds) {
    const collision = resolveNodeCollisions(
      nextState,
      piece.ownerId,
      nodeId,
      board,
    );
    nextState = collision.state;
    events.push(...collision.events);
  }

  const movedPiece = findPieceByOwner(nextState, piece.ownerId, piece.id);
  const landingCollision = resolveLandingCollisions(nextState, movedPiece, board);
  nextState = landingCollision.state;
  events.push(...landingCollision.events);

  return { taken: true, transition: { state: nextState, events } };
}

function resolveNodeCollisions(
  state: ClassicGameState,
  movingPlayerId: PlayerId,
  nodeId: BoardNodeId,
  board: BoardDefinition,
): GameTransition {
  const node = board.nodes[nodeId];
  if (!node || node.safe || node.kind !== "track") {
    return { state, events: [] };
  }

  let nextState = state;
  const events: GameEvent[] = [];
  for (const player of state.players) {
    if (player.id === movingPlayerId) continue;
    for (const piece of player.pieces) {
      if (getPieceNodeId(piece, board) !== nodeId) continue;
      nextState = updatePiece(nextState, player.id, piece.id, (current) =>
        returnPieceToBase(current, board),
      );
      events.push({
        type: "piece-returned-to-base",
        playerId: player.id,
        pieceId: piece.id,
        reason: "collision",
      });
    }
  }
  return { state: nextState, events };
}

function getPieceNodeId(
  piece: PieceState,
  board: BoardDefinition,
): BoardNodeId | null {
  if (piece.routeIndex === null) return null;
  return getPlayerRoute(board, piece.ownerId).nodeIds[piece.routeIndex] ?? null;
}

function pieceAtRouteIndex(
  piece: PieceState,
  routeIndex: number,
  board: BoardDefinition,
): PieceState {
  const route = getPlayerRoute(board, piece.ownerId);
  const node = getRouteNode(board, piece.ownerId, routeIndex);
  const finishIndex = route.nodeIds.length - 1;
  return {
    ...piece,
    routeIndex,
    zone: node.kind === "finish" ? "finished" : node.kind,
    distanceToFinish: finishIndex - routeIndex,
  };
}

function returnPieceToBase(
  piece: PieceState,
  board: BoardDefinition,
): PieceState {
  const route = getPlayerRoute(board, piece.ownerId);
  return {
    ...piece,
    zone: "base",
    routeIndex: null,
    distanceToFinish: route.nodeIds.length - 1,
  };
}

function updatePiece(
  state: ClassicGameState,
  playerId: PlayerId,
  pieceId: PieceId,
  updater: (piece: PieceState) => PieceState,
): ClassicGameState {
  let found = false;
  const players = state.players.map((player): PlayerState => {
    if (player.id !== playerId) return player;
    return {
      ...player,
      pieces: player.pieces.map((piece) => {
        if (piece.id !== pieceId) return piece;
        found = true;
        return updater(piece);
      }),
    };
  });
  if (!found) throw new Error(`Unknown piece ${pieceId} for player ${playerId}.`);
  return { ...state, players };
}

function advanceTurn(
  state: ClassicGameState,
  existingEvents: readonly GameEvent[],
): GameTransition {
  const previousPlayer = getActivePlayer(state);
  const activePlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
  const nextPlayer = state.players[activePlayerIndex];
  if (!nextPlayer) throw new Error("Cannot advance to the next player.");
  const turnNumber = state.turnNumber + 1;
  return {
    state: {
      ...state,
      activePlayerIndex,
      phase: "awaiting-roll",
      pendingRoll: null,
      consecutiveSpecialRolls: 0,
      turnNumber,
    },
    events: [
      ...existingEvents,
      {
        type: "turn-changed",
        previousPlayerId: previousPlayer.id,
        activePlayerId: nextPlayer.id,
        turnNumber,
      },
    ],
  };
}

function findPiece(player: PlayerState, pieceId: PieceId): PieceState {
  const piece = player.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) throw new Error(`Unknown piece: ${pieceId}`);
  return piece;
}

function findPieceByOwner(
  state: ClassicGameState,
  playerId: PlayerId,
  pieceId: PieceId,
): PieceState {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`Unknown player: ${playerId}`);
  return findPiece(player, pieceId);
}

function assertActivePlayer(
  state: ClassicGameState,
  playerId: PlayerId,
): void {
  const activePlayer = getActivePlayer(state);
  if (activePlayer.id !== playerId) {
    throw new Error(`It is ${activePlayer.id}'s turn, not ${playerId}'s.`);
  }
}

function assertPhase(
  state: ClassicGameState,
  expected: ClassicGameState["phase"],
): void {
  if (state.phase !== expected) {
    throw new Error(`Expected phase ${expected}, received ${state.phase}.`);
  }
}

function assertDiceRoll(roll: number): void {
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) {
    throw new Error(`Invalid six-sided dice roll: ${roll}`);
  }
}
