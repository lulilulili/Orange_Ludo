import { describe, expect, it } from "vitest";

import {
  DEFAULT_CLASSIC_BOARD_LAYOUT,
  createClassicBoard,
} from "./classic-board.js";

describe("classic board layout", () => {
  it("creates four rotated routes over a shared 52-node track", () => {
    const board = createClassicBoard();

    expect(Object.keys(board.routes)).toHaveLength(4);
    expect(board.routes.red!.nodeIds).toHaveLength(58);
    expect(board.routes.red!.nodeIds[0]).toBe("track-00");
    expect(board.routes.yellow!.nodeIds[0]).toBe("track-13");
    expect(board.routes.blue!.nodeIds[0]).toBe("track-26");
    expect(board.routes.green!.nodeIds[0]).toBe("track-39");
    expect(board.routes.red!.nodeIds.at(-1)).toBe("red-finish");
  });

  it("maps equivalent physical cells to the same node ID", () => {
    const board = createClassicBoard();

    expect(board.routes.red!.nodeIds[13]).toBe("track-13");
    expect(board.routes.yellow!.nodeIds[0]).toBe("track-13");
  });

  it("marks initial start cells safe through configuration", () => {
    const board = createClassicBoard();

    for (const index of DEFAULT_CLASSIC_BOARD_LAYOUT.safeTrackIndices) {
      const id = `track-${index.toString().padStart(2, "0")}`;
      expect(board.nodes[id]!.safe).toBe(true);
    }
  });

  it("supports a different logical track without engine changes", () => {
    const board = createClassicBoard({
      outerTrackLength: 40,
      startOffsets: [0, 10, 20, 30],
      safeTrackIndices: [0, 10, 20, 30],
      homeStretchLength: 4,
    });

    expect(board.routes.red!.nodeIds).toHaveLength(45);
    expect(board.routes.green!.nodeIds[0]).toBe("track-30");
  });
});
