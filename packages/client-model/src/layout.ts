import type {
  BoardDefinition,
  BoardNodeId,
  PlayerId,
} from "@orange-ludo/game-core";

export interface NormalizedPoint {
  readonly x: number;
  readonly y: number;
}

export interface NormalizedRect extends NormalizedPoint {
  readonly width: number;
  readonly height: number;
}

/**
 * Cocos and future clients consume this contract instead of owning rule data.
 * Coordinates are normalized so an approved UI layout can replace the
 * placeholder without changing game logic.
 */
export interface PortraitBoardLayout {
  readonly version: 1;
  readonly orientation: "portrait";
  readonly boardViewport: NormalizedRect;
  readonly nodePositions: Readonly<Record<BoardNodeId, NormalizedPoint>>;
  readonly baseSlots: Readonly<Record<PlayerId, readonly NormalizedPoint[]>>;
  readonly hud: {
    readonly turnIndicator: NormalizedPoint;
    readonly timer: NormalizedPoint;
    readonly dice: NormalizedPoint;
    readonly actionButton: NormalizedPoint;
  };
}

const CENTER: NormalizedPoint = Object.freeze({ x: 0.5, y: 0.5 });

/**
 * Developer layout for a 750x1334 portrait canvas. It deliberately contains
 * no final art assumptions; the UI team may replace only this data asset.
 */
export function createPlaceholderPortraitLayout(
  board: BoardDefinition,
  playerIds: readonly PlayerId[],
  piecesPerPlayer = 4,
): PortraitBoardLayout {
  if (playerIds.length !== 4 || new Set(playerIds).size !== 4) {
    throw new Error("Portrait classic layout requires four unique players.");
  }
  if (!Number.isInteger(piecesPerPlayer) || piecesPerPlayer < 1) {
    throw new Error("Pieces per player must be a positive whole number.");
  }

  const trackNodeIds = Object.values(board.nodes)
    .filter((node) => node.kind === "track")
    .map((node) => node.id)
    .sort(compareTrackNodeIds);
  if (trackNodeIds.length !== 52) {
    throw new Error(
      `Placeholder classic layout expects 52 track nodes, received ${trackNodeIds.length}.`,
    );
  }

  const nodePositions: Record<BoardNodeId, NormalizedPoint> = {};
  trackNodeIds.forEach((nodeId, index) => {
    nodePositions[nodeId] = pointOnSquareTrack(index);
  });

  const baseSlots: Record<PlayerId, readonly NormalizedPoint[]> = {};
  playerIds.forEach((playerId, playerIndex) => {
    const route = board.routes[playerId];
    if (!route) throw new Error(`Missing route for player ${playerId}.`);
    const firstTrackId = route.nodeIds.find(
      (nodeId) => board.nodes[nodeId]?.kind === "track",
    );
    if (!firstTrackId) throw new Error(`Route ${playerId} has no track node.`);

    const firstTrackPosition = nodePositions[firstTrackId];
    if (!firstTrackPosition) {
      throw new Error(`Missing layout point for ${firstTrackId}.`);
    }
    const launchNodeId = route.nodeIds.find(
      (nodeId) => board.nodes[nodeId]?.kind === "launch",
    );
    if (!launchNodeId) throw new Error(`Route ${playerId} has no launch node.`);
    nodePositions[launchNodeId] = projectFromCenter(firstTrackPosition, 0.1);

    const homeNodeIds = route.nodeIds.filter(
      (nodeId) => board.nodes[nodeId]?.kind === "home-stretch",
    );
    const finalTrackId = [...route.nodeIds]
      .reverse()
      .find((nodeId) => board.nodes[nodeId]?.kind === "track");
    if (!finalTrackId) throw new Error(`Route ${playerId} has no final track node.`);
    const homeStart = nodePositions[finalTrackId];
    if (!homeStart) throw new Error(`Missing layout point for ${finalTrackId}.`);
    homeNodeIds.forEach((nodeId, index) => {
      nodePositions[nodeId] = interpolate(
        homeStart,
        CENTER,
        (index + 1) / (homeNodeIds.length + 1),
      );
    });

    const finishNodeId = route.nodeIds.find(
      (nodeId) => board.nodes[nodeId]?.kind === "finish",
    );
    if (!finishNodeId) throw new Error(`Route ${playerId} has no finish node.`);
    nodePositions[finishNodeId] = interpolate(CENTER, homeStart, 0.045);
    baseSlots[playerId] = createBaseSlots(playerIndex, piecesPerPlayer);
  });

  for (const nodeId of Object.keys(board.nodes)) {
    if (!nodePositions[nodeId]) {
      throw new Error(`Layout is missing board node ${nodeId}.`);
    }
  }

  return {
    version: 1,
    orientation: "portrait",
    boardViewport: Object.freeze({ x: 0.04, y: 0.18, width: 0.92, height: 0.517 }),
    nodePositions: Object.freeze(nodePositions),
    baseSlots: Object.freeze(baseSlots),
    hud: Object.freeze({
      turnIndicator: Object.freeze({ x: 0.5, y: 0.075 }),
      timer: Object.freeze({ x: 0.5, y: 0.125 }),
      dice: Object.freeze({ x: 0.5, y: 0.79 }),
      actionButton: Object.freeze({ x: 0.5, y: 0.9 }),
    }),
  };
}

function compareTrackNodeIds(left: string, right: string): number {
  return Number(left.slice(left.lastIndexOf("-") + 1)) -
    Number(right.slice(right.lastIndexOf("-") + 1));
}

function pointOnSquareTrack(index: number): NormalizedPoint {
  const side = Math.floor(index / 13);
  const progress = (index % 13) / 13;
  const low = 0.2;
  const span = 0.6;
  switch (side) {
    case 0:
      return { x: low + span * progress, y: low + span };
    case 1:
      return { x: low + span, y: low + span * (1 - progress) };
    case 2:
      return { x: low + span * (1 - progress), y: low };
    case 3:
      return { x: low, y: low + span * progress };
    default:
      throw new Error(`Invalid track index ${index}.`);
  }
}

function projectFromCenter(point: NormalizedPoint, distance: number): NormalizedPoint {
  const dx = point.x - CENTER.x;
  const dy = point.y - CENTER.y;
  const length = Math.hypot(dx, dy);
  return {
    x: point.x + (dx / length) * distance,
    y: point.y + (dy / length) * distance,
  };
}

function interpolate(
  from: NormalizedPoint,
  to: NormalizedPoint,
  amount: number,
): NormalizedPoint {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}

function createBaseSlots(
  playerIndex: number,
  piecesPerPlayer: number,
): readonly NormalizedPoint[] {
  const centers: readonly NormalizedPoint[] = [
    { x: 0.09, y: 0.91 },
    { x: 0.91, y: 0.91 },
    { x: 0.91, y: 0.09 },
    { x: 0.09, y: 0.09 },
  ];
  const center = centers[playerIndex];
  if (!center) throw new Error(`Unsupported player index ${playerIndex}.`);
  const columns = Math.ceil(Math.sqrt(piecesPerPlayer));
  const rows = Math.ceil(piecesPerPlayer / columns);
  const spacing = 0.055;
  return Object.freeze(
    Array.from({ length: piecesPerPlayer }, (_, index) => ({
      x: center.x + (index % columns - (columns - 1) / 2) * spacing,
      y: center.y + (Math.floor(index / columns) - (rows - 1) / 2) * spacing,
    })),
  );
}
