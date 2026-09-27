import {
  AllowedRollsTakeoffRule,
  RequiredFinishedPiecesVictoryRule,
  ReturnNearestToFinishOnThresholdRule,
  type ConsecutiveRollRule,
  type TakeoffRule,
  type VictoryRule,
} from "./rules.js";

export interface ClassicRulesConfig {
  readonly playerCount: number;
  readonly piecesPerPlayer: number;
  readonly actionTimeoutMs: number;
  readonly takeoffRolls: readonly number[];
  readonly extraRollOn: readonly number[];
  readonly consecutiveSpecialRollThreshold: number;
  readonly requiredFinishedPieces: number;
  readonly stackingAllowed: boolean;
  readonly stacksBlockMovement: boolean;
  readonly orientation: "portrait" | "landscape";
}

export interface ClassicRuleset {
  readonly config: ClassicRulesConfig;
  readonly takeoff: TakeoffRule;
  readonly victory: VictoryRule;
  readonly consecutiveRoll: ConsecutiveRollRule;
}

export const DEFAULT_CLASSIC_RULES_CONFIG: Readonly<ClassicRulesConfig> =
  Object.freeze({
    playerCount: 4,
    piecesPerPlayer: 4,
    actionTimeoutMs: 15_000,
    takeoffRolls: Object.freeze([6]),
    extraRollOn: Object.freeze([6]),
    consecutiveSpecialRollThreshold: 3,
    requiredFinishedPieces: 4,
    stackingAllowed: true,
    stacksBlockMovement: true,
    orientation: "portrait",
  });

export function createClassicRuleset(
  overrides: Partial<ClassicRulesConfig> = {},
): ClassicRuleset {
  const config: ClassicRulesConfig = {
    ...DEFAULT_CLASSIC_RULES_CONFIG,
    ...overrides,
  };

  validateConfig(config);

  return {
    config,
    takeoff: new AllowedRollsTakeoffRule(config.takeoffRolls),
    victory: new RequiredFinishedPiecesVictoryRule(
      config.requiredFinishedPieces,
    ),
    consecutiveRoll: new ReturnNearestToFinishOnThresholdRule(
      config.consecutiveSpecialRollThreshold,
    ),
  };
}

function validateConfig(config: ClassicRulesConfig): void {
  if (!Number.isInteger(config.playerCount) || config.playerCount < 2) {
    throw new Error("Classic mode requires at least two players.");
  }

  if (!Number.isInteger(config.piecesPerPlayer) || config.piecesPerPlayer < 1) {
    throw new Error("Each player must have at least one piece.");
  }

  if (config.actionTimeoutMs <= 0) {
    throw new Error("Action timeout must be positive.");
  }

  if (config.requiredFinishedPieces > config.piecesPerPlayer) {
    throw new Error("Victory cannot require more pieces than a player owns.");
  }
}
