import type { BoardDefinition } from "./board.js";
import type { ClassicRuleset } from "./classic-ruleset.js";
import { applyPieceSelection, getLegalPieceIds } from "./engine.js";
import { getActivePlayer, type ClassicGameState } from "./game-state.js";
import { chooseIndex, type RandomSource } from "./random.js";
import type { PieceId, PieceState } from "./types.js";

export interface AiChoice {
  readonly pieceId: PieceId;
  readonly score: number;
}

/**
 * Baseline AI used by headless tests and the first human-vs-AI build.
 * It evaluates only legal engine transitions, so it cannot cheat.
 */
export function chooseAiPiece(
  state: ClassicGameState,
  board: BoardDefinition,
  ruleset: ClassicRuleset,
  random: RandomSource,
): AiChoice {
  if (state.phase !== "awaiting-piece" || state.pendingRoll === null) {
    throw new Error("AI can choose a piece only during piece selection.");
  }

  const player = getActivePlayer(state);
  const legalPieceIds = getLegalPieceIds(
    state,
    player.id,
    state.pendingRoll,
    board,
    ruleset,
  );
  if (legalPieceIds.length === 0) {
    throw new Error("AI was asked to move without a legal piece.");
  }

  const scored = legalPieceIds.map((pieceId): AiChoice => {
    const before = findPiece(state, pieceId);
    const transition = applyPieceSelection(
      state,
      player.id,
      pieceId,
      board,
      ruleset,
    );
    const after = findPiece(transition.state, pieceId);
    return {
      pieceId,
      score: scoreTransition(before, after, transition.events),
    };
  });

  const bestScore = Math.max(...scored.map((choice) => choice.score));
  const bestChoices = scored.filter((choice) => choice.score === bestScore);
  return bestChoices[chooseIndex(random, bestChoices.length)]!;
}

function scoreTransition(
  before: PieceState,
  after: PieceState,
  events: ReturnType<typeof applyPieceSelection>["events"],
): number {
  let score = before.distanceToFinish - after.distanceToFinish;

  if (before.zone === "base" && after.zone !== "base") score += 1_000;
  if (after.zone === "finished") score += 5_000;

  for (const event of events) {
    if (event.type === "game-ended") score += 100_000;
    if (
      event.type === "piece-returned-to-base" &&
      event.reason === "collision" &&
      event.playerId !== before.ownerId
    ) {
      score += 10_000;
    }
    if (event.type === "movement-blocked") score -= 500;
  }

  return score;
}

function findPiece(state: ClassicGameState, pieceId: PieceId): PieceState {
  for (const player of state.players) {
    const piece = player.pieces.find((candidate) => candidate.id === pieceId);
    if (piece) return piece;
  }
  throw new Error(`Unknown piece: ${pieceId}`);
}
