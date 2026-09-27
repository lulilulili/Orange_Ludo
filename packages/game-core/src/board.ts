import type { PlayerId } from "./types.js";

export type BoardNodeId = string;
export type BoardNodeKind = "track" | "home-stretch" | "finish";

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

export interface BoardDefinition {
  readonly nodes: Readonly<Record<BoardNodeId, BoardNode>>;
  readonly routes: Readonly<Record<PlayerId, PlayerRoute>>;
}

export function createBoardDefinition(
  nodes: readonly BoardNode[],
  routes: readonly PlayerRoute[],
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

  return {
    nodes: Object.freeze(nodeRecord),
    routes: Object.freeze(routeRecord),
  };
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
