import type {
  BoardNodeId,
  GameEvent,
  PieceId,
  PlayerId,
  SpecialMoveKind,
} from "@orange-ludo/game-core";

export type AnimationCue =
  | {
      readonly type: "dice";
      readonly playerId: PlayerId;
      readonly value: number;
      readonly durationMs: number;
    }
  | {
      readonly type: "piece-path";
      readonly pieceId: PieceId;
      readonly nodeIds: readonly BoardNodeId[];
      readonly durationMs: number;
    }
  | {
      readonly type: "special-path";
      readonly pieceId: PieceId;
      readonly kind: SpecialMoveKind;
      readonly nodeIds: readonly BoardNodeId[];
      readonly durationMs: number;
    }
  | {
      readonly type: "return-to-base";
      readonly pieceId: PieceId;
      readonly reason: "collision" | "third-special-roll";
      readonly durationMs: number;
    }
  | {
      readonly type: "blockade-pulse";
      readonly nodeId: BoardNodeId;
      readonly durationMs: number;
    }
  | {
      readonly type: "message";
      readonly code: "no-legal-move" | "special-move-blocked";
      readonly durationMs: number;
    }
  | {
      readonly type: "turn";
      readonly playerId: PlayerId;
      readonly turnNumber: number;
      readonly durationMs: number;
    }
  | {
      readonly type: "victory";
      readonly playerId: PlayerId;
      readonly durationMs: number;
    };

/** Converts authoritative events into a sequential, engine-agnostic animation queue. */
export function planAnimationCues(events: readonly GameEvent[]): readonly AnimationCue[] {
  const cues: AnimationCue[] = [];
  for (const event of events) {
    switch (event.type) {
      case "dice-rolled":
        cues.push({
          type: "dice",
          playerId: event.playerId,
          value: event.roll,
          durationMs: 500,
        });
        break;
      case "piece-taken-off":
        cues.push({
          type: "piece-path",
          pieceId: event.pieceId,
          nodeIds: [event.nodeId],
          durationMs: 300,
        });
        break;
      case "piece-moved":
        cues.push({
          type: "piece-path",
          pieceId: event.pieceId,
          nodeIds: event.traversedNodeIds,
          durationMs: Math.max(180, event.traversedNodeIds.length * 110),
        });
        break;
      case "special-move-taken":
        cues.push({
          type: "special-path",
          pieceId: event.pieceId,
          kind: event.kind,
          nodeIds: [event.fromNodeId, ...event.viaNodeIds, event.toNodeId],
          durationMs: event.kind === "flight" ? 650 : 420,
        });
        break;
      case "piece-returned-to-base":
        cues.push({
          type: "return-to-base",
          pieceId: event.pieceId,
          reason: event.reason,
          durationMs: 450,
        });
        break;
      case "movement-blocked":
        cues.push({
          type: "blockade-pulse",
          nodeId: event.blockadeNodeId,
          durationMs: 400,
        });
        break;
      case "special-move-blocked":
        cues.push({
          type: "blockade-pulse",
          nodeId: event.blockingNodeId,
          durationMs: 400,
        });
        cues.push({ type: "message", code: "special-move-blocked", durationMs: 900 });
        break;
      case "no-legal-move":
        cues.push({ type: "message", code: "no-legal-move", durationMs: 700 });
        break;
      case "turn-changed":
        cues.push({
          type: "turn",
          playerId: event.activePlayerId,
          turnNumber: event.turnNumber,
          durationMs: 250,
        });
        break;
      case "game-ended":
        cues.push({
          type: "victory",
          playerId: event.winnerId,
          durationMs: 1_200,
        });
        break;
    }
  }
  return cues;
}
