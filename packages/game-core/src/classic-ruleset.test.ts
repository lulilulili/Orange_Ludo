import { describe, expect, it } from "vitest";

import {
  DEFAULT_CLASSIC_RULES_CONFIG,
  createClassicRuleset,
} from "./classic-ruleset.js";
import type { MatchState, PieceState } from "./types.js";

describe("classic ruleset defaults", () => {
  it("matches the confirmed first-version settings", () => {
    expect(DEFAULT_CLASSIC_RULES_CONFIG).toMatchObject({
      playerCount: 4,
      piecesPerPlayer: 4,
      actionTimeoutMs: 15_000,
      takeoffRolls: [6],
      extraRollOn: [6],
      consecutiveSpecialRollThreshold: 3,
      requiredFinishedPieces: 4,
      stackingAllowed: true,
      stacksBlockMovement: true,
      orientation: "portrait",
    });
  });

  it("allows only a six to take off by default", () => {
    const ruleset = createClassicRuleset();

    for (const roll of [1, 2, 3, 4, 5]) {
      expect(ruleset.takeoff.canTakeOff(roll)).toBe(false);
    }
    expect(ruleset.takeoff.canTakeOff(6)).toBe(true);
  });

  it("supports changing takeoff rolls without changing the engine", () => {
    const ruleset = createClassicRuleset({ takeoffRolls: [5, 6] });

    expect(ruleset.takeoff.canTakeOff(5)).toBe(true);
    expect(ruleset.takeoff.canTakeOff(6)).toBe(true);
  });
});

describe("classic victory rule", () => {
  it("requires all four pieces to finish by default", () => {
    const ruleset = createClassicRuleset();
    const state = matchWithFinishedPieces(3);

    expect(ruleset.victory.hasWon(state, "orange")).toBe(false);
    expect(
      ruleset.victory.hasWon(matchWithFinishedPieces(4), "orange"),
    ).toBe(true);
  });

  it("supports a different finish target", () => {
    const ruleset = createClassicRuleset({ requiredFinishedPieces: 2 });

    expect(
      ruleset.victory.hasWon(matchWithFinishedPieces(2), "orange"),
    ).toBe(true);
  });
});

describe("third consecutive six", () => {
  it("ends the turn and returns the in-flight piece nearest the finish", () => {
    const ruleset = createClassicRuleset();
    const pieces: PieceState[] = [
      piece("plane-1", "track", 20),
      piece("plane-2", "home-stretch", 3),
      piece("plane-3", "finished", 0),
      piece("plane-4", "base", 60),
    ];

    expect(
      ruleset.consecutiveRoll.evaluate({
        playerId: "orange",
        consecutiveSpecialRolls: 3,
        pieces,
      }),
    ).toEqual({ turnEnds: true, pieceIdToReturn: "plane-2" });
  });

  it("does not return a piece when none is in flight", () => {
    const ruleset = createClassicRuleset();
    const pieces: PieceState[] = [
      piece("plane-1", "base", 60),
      piece("plane-2", "finished", 0),
    ];

    expect(
      ruleset.consecutiveRoll.evaluate({
        playerId: "orange",
        consecutiveSpecialRolls: 3,
        pieces,
      }),
    ).toEqual({ turnEnds: true, pieceIdToReturn: null });
  });

  it("does not apply the penalty before the threshold", () => {
    const ruleset = createClassicRuleset();

    expect(
      ruleset.consecutiveRoll.evaluate({
        playerId: "orange",
        consecutiveSpecialRolls: 2,
        pieces: [piece("plane-1", "track", 4)],
      }),
    ).toEqual({ turnEnds: false, pieceIdToReturn: null });
  });
});

function matchWithFinishedPieces(finishedCount: number): MatchState {
  return {
    players: [
      {
        id: "orange",
        pieces: Array.from({ length: 4 }, (_, index) =>
          piece(
            `plane-${index + 1}`,
            index < finishedCount ? "finished" : "track",
            index < finishedCount ? 0 : 10,
          ),
        ),
      },
    ],
  };
}

function piece(
  id: string,
  zone: PieceState["zone"],
  distanceToFinish: number,
): PieceState {
  return {
    id,
    ownerId: "orange",
    zone,
    routeIndex: zone === "base" ? null : 0,
    distanceToFinish,
  };
}
