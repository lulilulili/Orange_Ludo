import { describe, expect, it } from "vitest";

import {
  DEFAULT_CLASSIC_BOARD_LAYOUT,
  createClassicBoard,
} from "./classic-board.js";

describe("classic board layout", () => {
  it("creates four rotated routes over a shared 52-node track", () => {
    const board = createClassicBoard();

    expect(Object.keys(board.routes)).toHaveLength(4);
    expect(board.routes.red!.nodeIds).toHaveLength(59);
    expect(board.routes.red!.nodeIds[0]).toBe("red-launch");
    expect(board.routes.red!.nodeIds[1]).toBe("track-00");
    expect(board.routes.yellow!.nodeIds[1]).toBe("track-13");
    expect(board.routes.blue!.nodeIds[1]).toBe("track-26");
    expect(board.routes.green!.nodeIds[1]).toBe("track-39");
    expect(board.routes.red!.nodeIds.at(-1)).toBe("red-finish");
  });

  it("maps equivalent physical cells to the same node ID", () => {
    const board = createClassicBoard();

    expect(board.routes.red!.nodeIds[14]).toBe("track-13");
    expect(board.routes.yellow!.nodeIds[1]).toBe("track-13");
  });

  it("keeps launch and private home nodes safe", () => {
    const board = createClassicBoard();

    expect(DEFAULT_CLASSIC_BOARD_LAYOUT.safeTrackIndices).toEqual([]);
    expect(board.nodes["red-launch"]!.safe).toBe(true);
    expect(board.nodes["red-home-1"]!.safe).toBe(true);
  });

  it("supports a different logical track without engine changes", () => {
    const board = createClassicBoard({
      outerTrackLength: 40,
      startOffsets: [0, 10, 20, 30],
      safeTrackIndices: [0, 10, 20, 30],
      homeStretchLength: 4,
    });

    expect(board.routes.red!.nodeIds).toHaveLength(46);
    expect(board.routes.green!.nodeIds[1]).toBe("track-30");
  });

  it("defines configurable color jumps and cross-board flights", () => {
    const board = createClassicBoard();
    const redJump = board.specialMoves.find(
      (move) =>
        move.playerId === "red" &&
        move.kind === "color-jump" &&
        move.fromNodeId === "track-01",
    );
    const redFlight = board.specialMoves.find(
      (move) => move.playerId === "red" && move.kind === "flight",
    );

    expect(redJump?.toNodeId).toBe("track-05");
    expect(redFlight).toMatchObject({
      fromNodeId: "track-17",
      toNodeId: "track-29",
    });
  });
});
