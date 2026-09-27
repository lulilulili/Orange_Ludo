import { describe, expect, it } from "vitest";

import { chooseAiPiece } from "./ai.js";
import { createBoardDefinition } from "./board.js";
import { createClassicRuleset } from "./classic-ruleset.js";
import { applyDiceRoll, createInitialClassicGameState } from "./engine.js";
import type { ClassicGameState } from "./game-state.js";
import type { RandomSource } from "./random.js";
import type { PieceState, PlayerState } from "./types.js";

const fixedRandom: RandomSource = { next: () => 0 };

describe("baseline AI", () => {
  it("prefers a winning move", () => {
    const { board, ruleset, state } = setup();
    let arranged = state;
    for (let index = 0; index < 3; index += 1) {
      arranged = replacePiece(arranged, index, {
        zone: "finished",
        routeIndex: 3,
        distanceToFinish: 0,
      });
    }
    arranged = replacePiece(arranged, 3, {
      zone: "home-stretch",
      routeIndex: 2,
      distanceToFinish: 1,
    });
    const selecting = applyDiceRoll(
      arranged,
      "red",
      1,
      board,
      ruleset,
    ).state;

    expect(chooseAiPiece(selecting, board, ruleset, fixedRandom).pieceId).toBe(
      "red-plane-4",
    );
  });

  it("prefers a collision over ordinary progress", () => {
    const { board, ruleset, state } = setup();
    let arranged = replacePiece(state, 0, {
      zone: "track",
      routeIndex: 0,
      distanceToFinish: 3,
    });
    arranged = replacePiece(arranged, 1, {
      zone: "track",
      routeIndex: 1,
      distanceToFinish: 2,
    });
    arranged = replaceOtherPlayerPiece(arranged, "yellow", {
      zone: "track",
      routeIndex: 1,
      distanceToFinish: 2,
    });
    const selecting = applyDiceRoll(
      arranged,
      "red",
      1,
      board,
      ruleset,
    ).state;

    expect(chooseAiPiece(selecting, board, ruleset, fixedRandom).pieceId).toBe(
      "red-plane-1",
    );
  });
});

function setup() {
  const nodes = [
    { id: "track-0", kind: "track" as const, safe: false, ownerId: null },
    { id: "track-1", kind: "track" as const, safe: false, ownerId: null },
    { id: "red-home", kind: "home-stretch" as const, safe: true, ownerId: "red" },
    { id: "red-finish", kind: "finish" as const, safe: true, ownerId: "red" },
    ...["yellow", "blue", "green"].flatMap((playerId) => [
      { id: `${playerId}-home`, kind: "home-stretch" as const, safe: true, ownerId: playerId },
      { id: `${playerId}-finish`, kind: "finish" as const, safe: true, ownerId: playerId },
    ]),
  ];
  const board = createBoardDefinition(
    nodes,
    ["red", "yellow", "blue", "green"].map((playerId) => ({
      playerId,
      nodeIds: ["track-0", "track-1", `${playerId}-home`, `${playerId}-finish`],
    })),
  );
  const ruleset = createClassicRuleset();
  const state = createInitialClassicGameState(
    ["red", "yellow", "blue", "green"],
    board,
    ruleset,
  );
  return { board, ruleset, state };
}

function replacePiece(
  state: ClassicGameState,
  pieceIndex: number,
  replacement: Pick<PieceState, "zone" | "routeIndex" | "distanceToFinish">,
): ClassicGameState {
  return replacePlayerPiece(state, "red", pieceIndex, replacement);
}

function replaceOtherPlayerPiece(
  state: ClassicGameState,
  playerId: string,
  replacement: Pick<PieceState, "zone" | "routeIndex" | "distanceToFinish">,
): ClassicGameState {
  return replacePlayerPiece(state, playerId, 0, replacement);
}

function replacePlayerPiece(
  state: ClassicGameState,
  playerId: string,
  pieceIndex: number,
  replacement: Pick<PieceState, "zone" | "routeIndex" | "distanceToFinish">,
): ClassicGameState {
  return {
    ...state,
    players: state.players.map((player): PlayerState =>
      player.id === playerId
        ? {
            ...player,
            pieces: player.pieces.map((piece, index) =>
              index === pieceIndex ? { ...piece, ...replacement } : piece,
            ),
          }
        : player,
    ),
  };
}
