import { describe, expect, it } from "vitest";

import { createClassicBoard } from "./classic-board.js";
import { createClassicRuleset } from "./classic-ruleset.js";
import {
  applyDiceRoll,
  applyPieceSelection,
  createInitialClassicGameState,
} from "./engine.js";
import type { ClassicGameState } from "./game-state.js";
import type { PieceState, PlayerState } from "./types.js";

const PLAYER_IDS = ["red", "yellow", "blue", "green"] as const;

describe("classic special moves", () => {
  it("takes off into an independent launch node", () => {
    const { board, ruleset, state } = setup();
    const afterRoll = applyDiceRoll(state, "red", 6, board, ruleset).state;
    const transition = applyPieceSelection(
      afterRoll,
      "red",
      "red-plane-1",
      board,
      ruleset,
    );

    expect(transition.state.players[0]!.pieces[0]).toMatchObject({
      zone: "launch",
      routeIndex: 0,
    });
  });

  it("jumps four cells after a direct landing on the player's color", () => {
    const { board, ruleset, state } = setup();
    const arranged = placePiece(state, "red", 0, 1, "track");

    const transition = move(arranged, "red", "red-plane-1", 1);

    expect(transition.state.players[0]!.pieces[0]!.routeIndex).toBe(6);
    expect(transition.events).toContainEqual({
      type: "special-move-taken",
      playerId: "red",
      pieceId: "red-plane-1",
      kind: "color-jump",
      fromNodeId: "track-01",
      toNodeId: "track-05",
      viaNodeIds: [],
    });
  });

  it("takes a direct flight and then one color jump", () => {
    const { state } = setup();
    const arranged = placePiece(state, "red", 0, 17, "track");

    const transition = move(arranged, "red", "red-plane-1", 1);
    const specialKinds = transition.events
      .filter((event) => event.type === "special-move-taken")
      .map((event) => event.kind);

    expect(transition.state.players[0]!.pieces[0]!.routeIndex).toBe(34);
    expect(specialKinds).toEqual(["flight", "color-jump"]);
  });

  it("flies after jumping onto the flight entry without a second jump", () => {
    const { state } = setup();
    const arranged = placePiece(state, "red", 0, 13, "track");

    const transition = move(arranged, "red", "red-plane-1", 1);
    const specialKinds = transition.events
      .filter((event) => event.type === "special-move-taken")
      .map((event) => event.kind);

    expect(transition.state.players[0]!.pieces[0]!.routeIndex).toBe(30);
    expect(specialKinds).toEqual(["color-jump", "flight"]);
  });

  it("does not enter a flight whose destination is blocked by an enemy stack", () => {
    const { state } = setup();
    let arranged = placePiece(state, "red", 0, 17, "track");
    arranged = placePiece(arranged, "yellow", 0, 17, "track");
    arranged = placePiece(arranged, "yellow", 1, 17, "track");

    const transition = move(arranged, "red", "red-plane-1", 1);

    expect(transition.state.players[0]!.pieces[0]!.routeIndex).toBe(18);
    expect(transition.events).toContainEqual({
      type: "special-move-blocked",
      playerId: "red",
      pieceId: "red-plane-1",
      kind: "flight",
      fromNodeId: "track-17",
      blockingNodeId: "track-29",
    });
  });

  it("captures a single enemy on a color-jump destination", () => {
    const { state } = setup();
    let arranged = placePiece(state, "red", 0, 1, "track");
    arranged = placePiece(arranged, "yellow", 0, 45, "track");

    const transition = move(arranged, "red", "red-plane-1", 1);

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
});

function setup() {
  const board = createClassicBoard();
  const ruleset = createClassicRuleset();
  const state = createInitialClassicGameState(PLAYER_IDS, board, ruleset);
  return { board, ruleset, state };
}

function move(
  state: ClassicGameState,
  playerId: string,
  pieceId: string,
  roll: number,
) {
  const board = createClassicBoard();
  const ruleset = createClassicRuleset();
  const afterRoll = applyDiceRoll(state, playerId, roll, board, ruleset).state;
  return applyPieceSelection(
    afterRoll,
    playerId,
    pieceId,
    board,
    ruleset,
  );
}

function placePiece(
  state: ClassicGameState,
  playerId: string,
  pieceIndex: number,
  routeIndex: number,
  zone: PieceState["zone"],
): ClassicGameState {
  return {
    ...state,
    players: state.players.map((player): PlayerState => {
      if (player.id !== playerId) return player;
      return {
        ...player,
        pieces: player.pieces.map((piece, index) =>
          index === pieceIndex
            ? {
                ...piece,
                zone,
                routeIndex,
                distanceToFinish: 58 - routeIndex,
              }
            : piece,
        ),
      };
    }),
  };
}
