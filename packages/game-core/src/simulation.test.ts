import { describe, expect, it } from "vitest";

import { createClassicBoard } from "./classic-board.js";
import { createClassicRuleset } from "./classic-ruleset.js";
import { simulateClassicGame } from "./simulation.js";

describe("headless classic simulation", () => {
  it("is deterministic for the same seed", () => {
    const board = createClassicBoard();
    const ruleset = createClassicRuleset();
    const options = {
      seed: 20260927,
      playerIds: ["red", "yellow", "blue", "green"],
      board,
      ruleset,
    } as const;

    const first = simulateClassicGame(options);
    const second = simulateClassicGame(options);

    expect(second.winnerId).toBe(first.winnerId);
    expect(second.actionCount).toBe(first.actionCount);
    expect(second.turnCount).toBe(first.turnCount);
  });

  it("finishes a batch of games without deadlock", () => {
    const board = createClassicBoard();
    const ruleset = createClassicRuleset();
    const results = Array.from({ length: 25 }, (_, seed) =>
      simulateClassicGame({
        seed,
        playerIds: ["red", "yellow", "blue", "green"],
        board,
        ruleset,
      }),
    );

    expect(results.every((result) => result.finalState.phase === "ended")).toBe(
      true,
    );
    expect(Math.max(...results.map((result) => result.actionCount))).toBeLessThan(
      50_000,
    );
  });
});
