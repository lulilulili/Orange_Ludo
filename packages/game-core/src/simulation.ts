import { chooseAiPiece } from "./ai.js";
import type { BoardDefinition } from "./board.js";
import type { ClassicRuleset } from "./classic-ruleset.js";
import {
  applyDiceRoll,
  applyPieceSelection,
  createInitialClassicGameState,
} from "./engine.js";
import { getActivePlayer, type ClassicGameState } from "./game-state.js";
import { Mulberry32Random, rollSixSided } from "./random.js";
import type { PlayerId } from "./types.js";

export interface SimulationResult {
  readonly seed: number;
  readonly winnerId: PlayerId;
  readonly actionCount: number;
  readonly turnCount: number;
  readonly finalState: ClassicGameState;
}

export function simulateClassicGame(options: {
  readonly seed: number;
  readonly playerIds: readonly PlayerId[];
  readonly board: BoardDefinition;
  readonly ruleset: ClassicRuleset;
  readonly maxActions?: number;
}): SimulationResult {
  const maxActions = options.maxActions ?? 50_000;
  const random = new Mulberry32Random(options.seed);
  let state = createInitialClassicGameState(
    options.playerIds,
    options.board,
    options.ruleset,
  );
  let actionCount = 0;

  while (state.phase !== "ended") {
    if (actionCount >= maxActions) {
      throw new Error(
        `Simulation ${options.seed} exceeded ${maxActions} actions at turn ${state.turnNumber}.`,
      );
    }

    const playerId = getActivePlayer(state).id;
    if (state.phase === "awaiting-roll") {
      state = applyDiceRoll(
        state,
        playerId,
        rollSixSided(random),
        options.board,
        options.ruleset,
      ).state;
    } else {
      const choice = chooseAiPiece(
        state,
        options.board,
        options.ruleset,
        random,
      );
      state = applyPieceSelection(
        state,
        playerId,
        choice.pieceId,
        options.board,
        options.ruleset,
      ).state;
    }
    actionCount += 1;
  }

  if (!state.winnerId) {
    throw new Error("Ended simulation has no winner.");
  }

  return {
    seed: options.seed,
    winnerId: state.winnerId,
    actionCount,
    turnCount: state.turnNumber,
    finalState: state,
  };
}
