import {
  createClassicBoard,
  createClassicRuleset,
  Mulberry32Random,
  type RandomSource,
} from "@orange-ludo/game-core";
import { describe, expect, it } from "vitest";
import { LocalClassicSession } from "./local-classic-session.js";

const playerIds = ["red", "yellow", "blue", "green"] as const;

class SequenceRandom implements RandomSource {
  private index = 0;
  constructor(private readonly values: readonly number[]) {}

  next(): number {
    const value = this.values[this.index];
    if (value === undefined) throw new Error("Random sequence exhausted.");
    this.index += 1;
    return value;
  }
}

function createSession(random: RandomSource): LocalClassicSession {
  return new LocalClassicSession({
    playerIds,
    humanPlayerIds: ["red"],
    board: createClassicBoard(),
    ruleset: createClassicRuleset(),
    random,
  });
}

describe("local classic session", () => {
  it("generates the human dice result and exposes legal selections", () => {
    const session = createSession(new SequenceRandom([0.99]));
    const roll = session.rollForHuman("red");

    expect(roll.action).toEqual({
      type: "roll",
      source: "human",
      playerId: "red",
      value: 6,
    });
    expect(session.state.phase).toBe("awaiting-piece");
    expect(session.legalPieceIds).toEqual([
      "red-plane-1",
      "red-plane-2",
      "red-plane-3",
      "red-plane-4",
    ]);
    expect(roll.nextActionTimeoutMs).toBe(15_000);
  });

  it("keeps an extra human turn after taking off on a six", () => {
    const session = createSession(new SequenceRandom([0.99]));
    session.rollForHuman("red");
    const move = session.selectPieceForHuman("red", "red-plane-1");

    expect(move.action.source).toBe("human");
    expect(session.state.phase).toBe("awaiting-roll");
    expect(session.activePlayerId).toBe("red");
  });

  it("automatically rolls or selects when the action expires", () => {
    const session = createSession(new SequenceRandom([0.99, 0.25]));
    const roll = session.handleTimeout("red");
    const move = session.handleTimeout("red");

    expect(roll.action.source).toBe("timeout");
    expect(move.action).toMatchObject({
      type: "select-piece",
      source: "timeout",
      playerId: "red",
    });
  });

  it("rejects human input for an AI-controlled player", () => {
    const session = createSession(new SequenceRandom([0.1]));
    session.rollForHuman("red");
    expect(session.activePlayerId).toBe("yellow");
    expect(() => session.rollForHuman("yellow")).toThrow(/controlled by AI/);
  });

  it("performs one atomic action for the active AI", () => {
    const session = createSession(new SequenceRandom([0.1, 0.99, 0.4]));
    session.rollForHuman("red");
    const aiRoll = session.performAiAction();
    const aiMove = session.performAiAction();

    expect(aiRoll.action).toMatchObject({
      type: "roll",
      source: "ai",
      playerId: "yellow",
      value: 6,
    });
    expect(aiMove.action).toMatchObject({
      type: "select-piece",
      source: "ai",
      playerId: "yellow",
    });
  });

  it("completes a deterministic human-vs-three-AI match through public actions", () => {
    const session = createSession(new Mulberry32Random(2_026_092_7));
    let actions = 0;
    while (session.state.phase !== "ended" && actions < 10_000) {
      if (session.isHumanTurn) {
        session.handleTimeout(session.activePlayerId);
      } else {
        session.performAiAction();
      }
      actions += 1;
    }

    expect(session.state.phase).toBe("ended");
    expect(session.state.winnerId).not.toBeNull();
    expect(actions).toBeLessThan(10_000);
  });
});
