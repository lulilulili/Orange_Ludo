import type {
  ConsecutiveRollOutcome,
  MatchState,
  PlayerId,
  TurnContext,
} from "./types.js";

export interface TakeoffRule {
  canTakeOff(roll: number): boolean;
}

export interface VictoryRule {
  hasWon(state: MatchState, playerId: PlayerId): boolean;
}

export interface ConsecutiveRollRule {
  evaluate(context: TurnContext): ConsecutiveRollOutcome;
}

export class AllowedRollsTakeoffRule implements TakeoffRule {
  private readonly allowedRolls: ReadonlySet<number>;

  constructor(allowedRolls: readonly number[]) {
    if (allowedRolls.length === 0) {
      throw new Error("Takeoff rule requires at least one allowed roll.");
    }

    for (const roll of allowedRolls) {
      assertDiceRoll(roll);
    }

    this.allowedRolls = new Set(allowedRolls);
  }

  canTakeOff(roll: number): boolean {
    assertDiceRoll(roll);
    return this.allowedRolls.has(roll);
  }
}

export class RequiredFinishedPiecesVictoryRule implements VictoryRule {
  constructor(private readonly requiredFinishedPieces: number) {
    if (!Number.isInteger(requiredFinishedPieces) || requiredFinishedPieces <= 0) {
      throw new Error("Victory rule requires a positive whole number of pieces.");
    }
  }

  hasWon(state: MatchState, playerId: PlayerId): boolean {
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      throw new Error(`Unknown player: ${playerId}`);
    }

    const finishedPieces = player.pieces.filter(
      (piece) => piece.zone === "finished",
    ).length;

    return finishedPieces >= this.requiredFinishedPieces;
  }
}

export class ReturnNearestToFinishOnThresholdRule
  implements ConsecutiveRollRule
{
  constructor(private readonly threshold: number) {
    if (!Number.isInteger(threshold) || threshold <= 1) {
      throw new Error("Consecutive-roll threshold must be greater than one.");
    }
  }

  evaluate(context: TurnContext): ConsecutiveRollOutcome {
    if (context.consecutiveSpecialRolls < this.threshold) {
      return { turnEnds: false, pieceIdToReturn: null };
    }

    const nearestPiece = context.pieces
      .filter(
        (piece) =>
          piece.ownerId === context.playerId &&
          (piece.zone === "track" || piece.zone === "home-stretch"),
      )
      .slice()
      .sort(
        (left, right) =>
          left.distanceToFinish - right.distanceToFinish ||
          left.id.localeCompare(right.id),
      )[0];

    return {
      turnEnds: true,
      pieceIdToReturn: nearestPiece?.id ?? null,
    };
  }
}

function assertDiceRoll(roll: number): void {
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) {
    throw new Error(`Invalid six-sided dice roll: ${roll}`);
  }
}
