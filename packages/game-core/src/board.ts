import type { PlayerId } from "./types.js";

export type BoardNodeId = string;
export type BoardNodeKind = "launch" | "track" | "home-stretch" | "finish";
export type SpecialMoveKind = "color-jump" | "flight";

export interface BoardNode {
  readonly id: BoardNodeId;
  readonly kind: BoardNodeKind;
  /** Safe nodes never resolve collisions and cannot form a blockade. */
  readonly safe: boolean;
  /** Home-stretch and finish nodes belong to one player. */
  readonly ownerId: PlayerId | null;
}

export interface PlayerRoute {
  readonly playerId: PlayerId;
  readonly nodeIds: readonly BoardNodeId[];
}

export interface SpecialMoveDefinition {
  readonly playerId: PlayerId;
  readonly kind: SpecialMoveKind;
  readonly fromNodeId: BoardNodeId;
  readonly toNodeId: BoardNodeId;
  /** Physical nodes crossed by a flight, used for collision/blockade rules. */
  readonly viaNodeIds: readonly BoardNodeId[];
}

export interface BoardDefinition {
  readonly nodes: Readonly<Record<BoardNodeId, BoardNode>>;
  readonly routes: Readonly<Record<PlayerId, PlayerRoute>>;
  readonly specialMoves: readonly SpecialMoveDefinition[];
}

export function createBoardDefinition(
  nodes: readonly BoardNode[],
  routes: readonly PlayerRoute[],
  specialMoves: readonly SpecialMoveDefinition[] = [],
): BoardDefinition {
  const nodeRecord: Record<BoardNodeId, BoardNode> = {};
  for (const node of nodes) {
    if (nodeRecord[node.id]) {
      throw new Error(`Duplicate board node: ${node.id}`);
    }
    nodeRecord[node.id] = node;
  }

  const routeRecord: Record<PlayerId, PlayerRoute> = {};
  for (const route of routes) {
    if (routeRecord[route.playerId]) {
      throw new Error(`Duplicate route for player: ${route.playerId}`);
    }
    if (route.nodeIds.length < 2) {
      throw new Error(`Route for ${route.playerId} must contain at least two nodes.`);
    }

    route.nodeIds.forEach((nodeId, index) => {
      const node = nodeRecord[nodeId];
      if (!node) {
        throw new Error(`Route for ${route.playerId} references unknown node: ${nodeId}`);
      }
      if (node.ownerId !== null && node.ownerId !== route.playerId) {
        throw new Error(
          `Route for ${route.playerId} uses node ${nodeId} owned by ${node.ownerId}.`,
        );
      }
      if (index === route.nodeIds.length - 1 && node.kind !== "finish") {
        throw new Error(`Route for ${route.playerId} must end at a finish node.`);
      }
    });

    routeRecord[route.playerId] = {
      playerId: route.playerId,
      nodeIds: Object.freeze([...route.nodeIds]),
    };
  }

  const specialMoveKeys = new Set<string>();
  for (const move of specialMoves) {
    const route = routeRecord[move.playerId];
    if (!route) {
      throw new Error(`Special move references unknown player: ${move.playerId}`);
    }
    const key = `${move.playerId}:${move.kind}:${move.fromNodeId}`;
    if (specialMoveKeys.has(key)) {
      throw new Error(`Duplicate special move: ${key}`);
    }
    specialMoveKeys.add(key);
    for (const nodeId of [move.fromNodeId, move.toNodeId, ...move.viaNodeIds]) {
      if (!nodeRecord[nodeId]) {
        throw new Error(`Special move references unknown node: ${nodeId}`);
      }
    }
    if (!route.nodeIds.includes(move.fromNodeId) || !route.nodeIds.includes(move.toNodeId)) {
      throw new Error(`Special move for ${move.playerId} must stay on that player's route.`);
    }
  }

  return {
    nodes: Object.freeze(nodeRecord),
    routes: Object.freeze(routeRecord),
    specialMoves: Object.freeze(
      specialMoves.map((move) => ({
        ...move,
        viaNodeIds: Object.freeze([...move.viaNodeIds]),
      })),
    ),
  };
}

export function getSpecialMove(
  board: BoardDefinition,
  playerId: PlayerId,
  nodeId: BoardNodeId,
  kind: SpecialMoveKind,
): SpecialMoveDefinition | null {
  return (
    board.specialMoves.find(
      (move) =>
        move.playerId === playerId &&
        move.fromNodeId === nodeId &&
        move.kind === kind,
    ) ?? null
  );
}

export function getPlayerRoute(
  board: BoardDefinition,
  playerId: PlayerId,
): PlayerRoute {
  const route = board.routes[playerId];
  if (!route) {
    throw new Error(`Board has no route for player: ${playerId}`);
  }
  return route;
}

export function getRouteNode(
  board: BoardDefinition,
  playerId: PlayerId,
  routeIndex: number,
): BoardNode {
  const route = getPlayerRoute(board, playerId);
  const nodeId = route.nodeIds[routeIndex];
  if (!nodeId) {
    throw new Error(`Invalid route index ${routeIndex} for player ${playerId}.`);
  }
  const node = board.nodes[nodeId];
  if (!node) {
    throw new Error(`Board node disappeared: ${nodeId}`);
  }
  return node;
}
