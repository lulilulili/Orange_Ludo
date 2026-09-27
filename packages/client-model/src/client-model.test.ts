import {
  createClassicBoard,
  createClassicRuleset,
  createInitialClassicGameState,
  type ClassicGameState,
  type GameEvent,
} from "@orange-ludo/game-core";
import { describe, expect, it } from "vitest";
import { planAnimationCues } from "./animation.js";
import { createPlaceholderPortraitLayout } from "./layout.js";
import { createClientViewState } from "./view-model.js";

const playerIds = ["red", "yellow", "blue", "green"] as const;

describe("portrait client layout", () => {
  it("places every logical node and four base slots per player", () => {
    const board = createClassicBoard();
    const layout = createPlaceholderPortraitLayout(board, playerIds);

    expect(layout.orientation).toBe("portrait");
    expect(Object.keys(layout.nodePositions)).toHaveLength(Object.keys(board.nodes).length);
    for (const playerId of playerIds) {
      expect(layout.baseSlots[playerId]).toHaveLength(4);
    }
  });

  it("keeps the 52 physical track locations distinct", () => {
    const board = createClassicBoard();
    const layout = createPlaceholderPortraitLayout(board, playerIds);
    const positions = Array.from({ length: 52 }, (_, index) => {
      const nodeId = `track-${index.toString().padStart(2, "0")}`;
      const point = layout.nodePositions[nodeId]!;
      return `${point.x.toFixed(4)}:${point.y.toFixed(4)}`;
    });
    expect(new Set(positions).size).toBe(52);
  });

  it("rejects layouts that do not have four players", () => {
    expect(() =>
      createPlaceholderPortraitLayout(createClassicBoard(), ["red", "yellow"]),
    ).toThrow(/four unique players/);
  });
});

describe("client view state", () => {
  it("maps initial pieces to separate base slots and exposes the 15 second timer", () => {
    const board = createClassicBoard();
    const ruleset = createClassicRuleset();
    const state = createInitialClassicGameState(playerIds, board, ruleset);
    const layout = createPlaceholderPortraitLayout(board, playerIds);
    const view = createClientViewState(state, board, layout);

    expect(view.activePlayerId).toBe("red");
    expect(view.remainingTurnMs).toBe(15_000);
    expect(view.remainingTurnRatio).toBe(1);
    expect(view.players.flatMap((player) => player.pieces)).toHaveLength(16);
    expect(view.players[0]!.pieces.every((piece) => piece.nodeId === null)).toBe(true);
  });

  it("marks only supplied legal pieces as selectable and clamps the timer", () => {
    const board = createClassicBoard();
    const ruleset = createClassicRuleset();
    const state = createInitialClassicGameState(playerIds, board, ruleset);
    const layout = createPlaceholderPortraitLayout(board, playerIds);
    const view = createClientViewState(state, board, layout, {
      legalPieceIds: ["red-plane-2"],
      remainingTurnMs: 18_000,
    });

    expect(view.players[0]!.pieces.map((piece) => piece.selectable)).toEqual([
      false,
      true,
      false,
      false,
    ]);
    expect(view.remainingTurnMs).toBe(15_000);
  });

  it("describes stacked pieces without changing their logical location", () => {
    const board = createClassicBoard();
    const ruleset = createClassicRuleset();
    const initial = createInitialClassicGameState(playerIds, board, ruleset);
    const state: ClassicGameState = {
      ...initial,
      players: initial.players.map((player) =>
        player.id === "red"
          ? {
              ...player,
              pieces: player.pieces.map((piece, index) =>
                index < 2
                  ? { ...piece, zone: "track" as const, routeIndex: 5, distanceToFinish: 53 }
                  : piece,
              ),
            }
          : player,
      ),
    };
    const view = createClientViewState(
      state,
      board,
      createPlaceholderPortraitLayout(board, playerIds),
    );
    const stacked = view.players[0]!.pieces.slice(0, 2);
    expect(stacked.map((piece) => piece.stackIndex)).toEqual([0, 1]);
    expect(stacked.every((piece) => piece.stackSize === 2)).toBe(true);
    expect(stacked[0]!.position).toEqual(stacked[1]!.position);
  });
});

describe("animation planning", () => {
  it("keeps event order and turns movement into engine-neutral cues", () => {
    const events: GameEvent[] = [
      { type: "dice-rolled", playerId: "red", roll: 3 },
      {
        type: "piece-moved",
        playerId: "red",
        pieceId: "red-plane-1",
        fromNodeId: "track-00",
        toNodeId: "track-03",
        traversedNodeIds: ["track-01", "track-02", "track-03"],
      },
      {
        type: "turn-changed",
        previousPlayerId: "red",
        activePlayerId: "yellow",
        turnNumber: 2,
      },
    ];
    const cues = planAnimationCues(events);

    expect(cues.map((cue) => cue.type)).toEqual(["dice", "piece-path", "turn"]);
    expect(cues[1]).toMatchObject({
      type: "piece-path",
      pieceId: "red-plane-1",
      durationMs: 330,
    });
  });

  it("uses distinct cues for flights, collisions, blockades and victory", () => {
    const events: GameEvent[] = [
      {
        type: "special-move-taken",
        playerId: "red",
        pieceId: "red-plane-1",
        kind: "flight",
        fromNodeId: "track-17",
        toNodeId: "track-29",
        viaNodeIds: [],
      },
      {
        type: "piece-returned-to-base",
        playerId: "yellow",
        pieceId: "yellow-plane-1",
        reason: "collision",
      },
      {
        type: "movement-blocked",
        playerId: "red",
        pieceId: "red-plane-1",
        blockadeNodeId: "track-31",
        stoppedAtNodeId: "track-30",
      },
      { type: "game-ended", winnerId: "red" },
    ];
    expect(planAnimationCues(events).map((cue) => cue.type)).toEqual([
      "special-path",
      "return-to-base",
      "blockade-pulse",
      "victory",
    ]);
  });
});
