import type { BoardNodeId } from "./board.js";
import type { MatchState, PieceId, PlayerId, PlayerState } from "./types.js";

export type GamePhase = "awaiting-roll" | "awaiting-piece" | "ended";

export interface ClassicGameState extends MatchState {
  readonly phase: GamePhase;
  readonly activePlayerIndex: number;
  readonly pendingRoll: number | null;
  readonly consecutiveSpecialRolls: number;
  readonly turnNumber: number;
  readonly winnerId: PlayerId | null;
}

export type GameEvent =
  | {
      readonly type: "dice-rolled";
      readonly playerId: PlayerId;
      readonly roll: number;
    }
  | {
      readonly type: "piece-taken-off";
      readonly playerId: PlayerId;
      readonly pieceId: PieceId;
      readonly nodeId: BoardNodeId;
    }
  | {
      readonly type: "piece-moved";
      readonly playerId: PlayerId;
      readonly pieceId: PieceId;
      readonly fromNodeId: BoardNodeId;
      readonly toNodeId: BoardNodeId;
      readonly traversedNodeIds: readonly BoardNodeId[];
    }
  | {
      readonly type: "movement-blocked";
      readonly playerId: PlayerId;
      readonly pieceId: PieceId;
      readonly blockadeNodeId: BoardNodeId;
      readonly stoppedAtNodeId: BoardNodeId;
    }
  | {
      readonly type: "piece-returned-to-base";
      readonly playerId: PlayerId;
      readonly pieceId: PieceId;
      readonly reason: "collision" | "third-special-roll";
    }
  | {
      readonly type: "no-legal-move";
      readonly playerId: PlayerId;
      readonly roll: number;
    }
  | {
      readonly type: "turn-changed";
      readonly previousPlayerId: PlayerId;
      readonly activePlayerId: PlayerId;
      readonly turnNumber: number;
    }
  | {
      readonly type: "game-ended";
      readonly winnerId: PlayerId;
    };

export interface GameTransition {
  readonly state: ClassicGameState;
  readonly events: readonly GameEvent[];
}

export function getActivePlayer(state: ClassicGameState): PlayerState {
  const player = state.players[state.activePlayerIndex];
  if (!player) {
    throw new Error(`Invalid active player index: ${state.activePlayerIndex}`);
  }
  return player;
}
