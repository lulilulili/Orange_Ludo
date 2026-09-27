import {
  getPlayerRoute,
  type BoardDefinition,
  type BoardNodeId,
  type ClassicGameState,
  type GamePhase,
  type PieceId,
  type PieceZone,
  type PlayerId,
} from "@orange-ludo/game-core";
import type { NormalizedPoint, PortraitBoardLayout } from "./layout.js";

export interface ClientViewOptions {
  readonly legalPieceIds?: readonly PieceId[];
  readonly remainingTurnMs?: number;
  readonly turnDurationMs?: number;
}

export interface PieceViewState {
  readonly id: PieceId;
  readonly ownerId: PlayerId;
  readonly zone: PieceZone;
  readonly nodeId: BoardNodeId | null;
  readonly position: NormalizedPoint;
  readonly selectable: boolean;
  readonly stackIndex: number;
  readonly stackSize: number;
}

export interface PlayerViewState {
  readonly id: PlayerId;
  readonly isActive: boolean;
  readonly finishedPieces: number;
  readonly pieces: readonly PieceViewState[];
}

export interface ClientViewState {
  readonly phase: GamePhase;
  readonly turnNumber: number;
  readonly activePlayerId: PlayerId;
  readonly pendingRoll: number | null;
  readonly winnerId: PlayerId | null;
  readonly remainingTurnMs: number;
  readonly remainingTurnRatio: number;
  readonly players: readonly PlayerViewState[];
}

/** Creates a render-only snapshot; mutating it can never affect the match. */
export function createClientViewState(
  state: ClassicGameState,
  board: BoardDefinition,
  layout: PortraitBoardLayout,
  options: ClientViewOptions = {},
): ClientViewState {
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer) throw new Error("Game state has no active player.");
  const legalPieceIds = new Set(options.legalPieceIds ?? []);
  const turnDurationMs = options.turnDurationMs ?? 15_000;
  if (!Number.isFinite(turnDurationMs) || turnDurationMs <= 0) {
    throw new Error("Turn duration must be greater than zero.");
  }
  const remainingTurnMs = Math.min(
    turnDurationMs,
    Math.max(0, options.remainingTurnMs ?? turnDurationMs),
  );

  const nodeOccupants = new Map<BoardNodeId, PieceId[]>();
  for (const player of state.players) {
    for (const piece of player.pieces) {
      const nodeId = getPieceNodeId(piece.ownerId, piece.routeIndex, board);
      if (!nodeId) continue;
      const occupants = nodeOccupants.get(nodeId) ?? [];
      occupants.push(piece.id);
      nodeOccupants.set(nodeId, occupants);
    }
  }

  const players = state.players.map((player): PlayerViewState => {
    const baseSlots = layout.baseSlots[player.id];
    if (!baseSlots) throw new Error(`Layout has no base for player ${player.id}.`);
    return {
      id: player.id,
      isActive: player.id === activePlayer.id,
      finishedPieces: player.pieces.filter((piece) => piece.zone === "finished").length,
      pieces: player.pieces.map((piece, pieceIndex): PieceViewState => {
        const nodeId = getPieceNodeId(piece.ownerId, piece.routeIndex, board);
        if (!nodeId) {
          const basePosition = baseSlots[pieceIndex];
          if (!basePosition) {
            throw new Error(`Layout has no base slot for piece ${piece.id}.`);
          }
          return {
            id: piece.id,
            ownerId: piece.ownerId,
            zone: piece.zone,
            nodeId: null,
            position: basePosition,
            selectable: legalPieceIds.has(piece.id),
            stackIndex: 0,
            stackSize: 1,
          };
        }

        const position = layout.nodePositions[nodeId];
        if (!position) throw new Error(`Layout has no point for node ${nodeId}.`);
        const occupants = nodeOccupants.get(nodeId) ?? [piece.id];
        return {
          id: piece.id,
          ownerId: piece.ownerId,
          zone: piece.zone,
          nodeId,
          position,
          selectable: legalPieceIds.has(piece.id),
          stackIndex: occupants.indexOf(piece.id),
          stackSize: occupants.length,
        };
      }),
    };
  });

  return {
    phase: state.phase,
    turnNumber: state.turnNumber,
    activePlayerId: activePlayer.id,
    pendingRoll: state.pendingRoll,
    winnerId: state.winnerId,
    remainingTurnMs,
    remainingTurnRatio: remainingTurnMs / turnDurationMs,
    players,
  };
}

function getPieceNodeId(
  ownerId: PlayerId,
  routeIndex: number | null,
  board: BoardDefinition,
): BoardNodeId | null {
  if (routeIndex === null) return null;
  return getPlayerRoute(board, ownerId).nodeIds[routeIndex] ?? null;
}
