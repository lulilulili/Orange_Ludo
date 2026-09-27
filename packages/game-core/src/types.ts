export type PlayerId = string;
export type PieceId = string;

export type PieceZone = "base" | "track" | "home-stretch" | "finished";

export interface PieceState {
  readonly id: PieceId;
  readonly ownerId: PlayerId;
  readonly zone: PieceZone;
  /** Index in the owner's configured route, or null while at base. */
  readonly routeIndex: number | null;
  /** Remaining forward steps along the configured route. */
  readonly distanceToFinish: number;
}

export interface PlayerState {
  readonly id: PlayerId;
  readonly pieces: readonly PieceState[];
}

export interface MatchState {
  readonly players: readonly PlayerState[];
}

export interface TurnContext {
  readonly playerId: PlayerId;
  readonly consecutiveSpecialRolls: number;
  readonly pieces: readonly PieceState[];
}

export interface ConsecutiveRollOutcome {
  readonly turnEnds: boolean;
  readonly pieceIdToReturn: PieceId | null;
}
