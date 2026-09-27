import { describe, expect, it } from "vitest";

import { createBoardDefinition, type BoardDefinition } from "./board.js";
import { createClassicRuleset } from "./classic-ruleset.js";
import {
  applyDiceRoll,
  applyPieceSelection,
  createInitialClassicGameState,
  getLegalPieceIds,
} from "./engine.js";
import type { ClassicGameState } from "./game-state.js";
import type { PieceState, PlayerState } from "./types.js";

const PLAYER_IDS = ["red", "yellow", "blue", "green"] as const;

describe("classic turn engine", () => {
  it("advances when a player with all pieces at base does not roll a six", () => {
    const { board, ruleset, state } = setup();
    const transition = applyDiceRoll(state, "red", 3, board, ruleset);

    expect(transition.state.activePlayerIndex).toBe(1);
    expect(transition.state.phase).toBe("awaiting-roll");
    expect(transition.events.map((event) => event.type)).toEqual([
      "dice-rolled",
      "no-legal-move",
      "turn-changed",
    ]);
  });

  it("offers all base pieces for takeoff after rolling a six", () => {
    const { board, ruleset, state } = setup();
    const transition = applyDiceRoll(state, "red", 6, board, ruleset);

    expect(transition.state.phase).toBe("awaiting-piece");
    expect(
      getLegalPieceIds(transition.state, "red", 6, board, ruleset),
    ).toHaveLength(4);
  });

  it("takes off and gives the same player another roll", () => {
    const { board, ruleset, state } = setup();
    const afterRoll = applyDiceRoll(state, "red", 6, board, ruleset).state;
    const transition = applyPieceSelection(
      afterRoll,
      "red",
      "red-plane-1",
      board,
      ruleset,
    );

    expect(transition.state.activePlayerIndex).toBe(0);
    expect(transition.state.phase).toBe("awaiting-roll");
    expect(transition.state.players[0]!.pieces[0]).toMatchObject({
      zone: "track",
      routeIndex: 0,
    });
  });

  it("applies the third-six penalty before selecting a move", () => {
    const { board, ruleset, state } = setup();
    const withPiece = replacePiece(state, "red", 0, {
      zone: "track",
      routeIndex: 3,
      distanceToFinish: 2,
    });
    const onThirdSix: ClassicGameState = {
      ...withPiece,
      consecutiveSpecialRolls: 2,
    };

    const transition = applyDiceRoll(onThirdSix, "red", 6, board, ruleset);

    expect(transition.state.activePlayerIndex).toBe(1);
    expect(transition.state.players[0]!.pieces[0]).toMatchObject({
      zone: "base",
      routeIndex: null,
    });
    expect(transition.events).toContainEqual({
      type: "piece-returned-to-base",
      playerId: "red",
      pieceId: "red-plane-1",
      reason: "third-special-roll",
    });
  });

  it("bounces backward when a roll exceeds the finish", () => {
    const { board, ruleset, state } = setup();
    const nearFinish = replacePiece(state, "red", 0, {
      zone: "home-stretch",
      routeIndex: 4,
      distanceToFinish: 1,
    });

    const afterRoll = applyDiceRoll(nearFinish, "red", 3, board, ruleset).state;
    const transition = applyPieceSelection(
      afterRoll,
      "red",
      "red-plane-1",
      board,
      ruleset,
    );

    expect(transition.state.players[0]!.pieces[0]).toMatchObject({
      zone: "track",
      routeIndex: 3,
      distanceToFinish: 2,
    });
  });

  it("returns a single opposing piece when landing on it", () => {
    const { board, ruleset, state } = setup();
    let arranged = replacePiece(state, "red", 0, {
      zone: "track",
      routeIndex: 0,
      distanceToFinish: 5,
    });
    arranged = replacePiece(arranged, "yellow", 0, {
      zone: "track",
      routeIndex: 1,
      distanceToFinish: 4,
    });

    const afterRoll = applyDiceRoll(arranged, "red", 1, board, ruleset).state;
    const transition = applyPieceSelection(
      afterRoll,
      "red",
      "red-plane-1",
      board,
      ruleset,
    );

    expect(transition.state.players[1]!.pieces[0]).toMatchObject({
      zone: "base",
      routeIndex: null,
    });
    expect(transition.events).toContainEqual({
      type: "piece-returned-to-base",
      playerId: "yellow",
      pieceId: "yellow-plane-1",
      reason: "collision",
    });
  });

  it("stops before an opposing stack blockade", () => {
    const { board, ruleset, state } = setup();
    let arranged = replacePiece(state, "red", 0, {
      zone: "track",
      routeIndex: 0,
      distanceToFinish: 5,
    });
    arranged = replacePiece(arranged, "yellow", 0, {
      zone: "track",
      routeIndex: 2,
      distanceToFinish: 3,
    });
    arranged = replacePiece(arranged, "yellow", 1, {
      zone: "track",
      routeIndex: 2,
      distanceToFinish: 3,
    });

    const afterRoll = applyDiceRoll(arranged, "red", 3, board, ruleset).state;
    const transition = applyPieceSelection(
      afterRoll,
      "red",
      "red-plane-1",
      board,
      ruleset,
    );

    expect(transition.state.players[0]!.pieces[0]!.routeIndex).toBe(1);
    expect(transition.events).toContainEqual({
      type: "movement-blocked",
      playerId: "red",
      pieceId: "red-plane-1",
      blockadeNodeId: "shared-2",
      stoppedAtNodeId: "shared-1",
    });
  });

  it("ends the game when the fourth piece reaches the finish", () => {
    const { board, ruleset, state } = setup();
    let arranged = state;
    for (let index = 0; index < 3; index += 1) {
      arranged = replacePiece(arranged, "red", index, {
        zone: "finished",
        routeIndex: 5,
        distanceToFinish: 0,
      });
    }
    arranged = replacePiece(arranged, "red", 3, {
      zone: "home-stretch",
      routeIndex: 4,
      distanceToFinish: 1,
    });

    const afterRoll = applyDiceRoll(arranged, "red", 1, board, ruleset).state;
    const transition = applyPieceSelection(
      afterRoll,
      "red",
      "red-plane-4",
      board,
      ruleset,
    );

    expect(transition.state.phase).toBe("ended");
    expect(transition.state.winnerId).toBe("red");
    expect(transition.events.at(-1)).toEqual({
      type: "game-ended",
      winnerId: "red",
    });
  });

  it("rejects actions from a non-active player", () => {
    const { board, ruleset, state } = setup();

    expect(() =>
      applyDiceRoll(state, "yellow", 6, board, ruleset),
    ).toThrow("It is red's turn");
  });
});

function setup(): {
  board: BoardDefinition;
  ruleset: ReturnType<typeof createClassicRuleset>;
  state: ClassicGameState;
} {
  const board = createTestBoard();
  const ruleset = createClassicRuleset();
  const state = createInitialClassicGameState(PLAYER_IDS, board, ruleset);
  return { board, ruleset, state };
}

function createTestBoard(): BoardDefinition {
  const sharedNodes = Array.from({ length: 4 }, (_, index) => ({
    id: `shared-${index}`,
    kind: "track" as const,
    safe: false,
    ownerId: null,
  }));
  const privateNodes = PLAYER_IDS.flatMap((playerId) => [
    {
      id: `${playerId}-home`,
      kind: "home-stretch" as const,
      safe: true,
      ownerId: playerId,
    },
    {
      id: `${playerId}-finish`,
      kind: "finish" as const,
      safe: true,
      ownerId: playerId,
    },
  ]);

  return createBoardDefinition(
    [...sharedNodes, ...privateNodes],
    PLAYER_IDS.map((playerId) => ({
      playerId,
      nodeIds: [
        "shared-0",
        "shared-1",
        "shared-2",
        "shared-3",
        `${playerId}-home`,
        `${playerId}-finish`,
      ],
    })),
  );
}

function replacePiece(
  state: ClassicGameState,
  playerId: string,
  pieceIndex: number,
  replacement: Pick<PieceState, "zone" | "routeIndex" | "distanceToFinish">,
): ClassicGameState {
  return {
    ...state,
    players: state.players.map((player): PlayerState => {
      if (player.id !== playerId) return player;
      return {
        ...player,
        pieces: player.pieces.map((piece, index) =>
          index === pieceIndex ? { ...piece, ...replacement } : piece,
        ),
      };
    }),
  };
}
