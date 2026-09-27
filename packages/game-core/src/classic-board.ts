import { createBoardDefinition, type BoardDefinition } from "./board.js";
import type { PlayerId } from "./types.js";

export interface ClassicBoardLayoutConfig {
  readonly playerIds: readonly [PlayerId, PlayerId, PlayerId, PlayerId];
  readonly outerTrackLength: number;
  /** Number of private nodes before the final finish node. */
  readonly homeStretchLength: number;
  readonly startOffsets: readonly [number, number, number, number];
  readonly safeTrackIndices: readonly number[];
  /** Relative outer-track index of the cross-board flight entry. */
  readonly flightEntryOffset: number;
  /** Relative outer-track index reached by the flight. */
  readonly flightExitOffset: number;
}

export const DEFAULT_CLASSIC_BOARD_LAYOUT: Readonly<ClassicBoardLayoutConfig> =
  Object.freeze({
    playerIds: Object.freeze(["red", "yellow", "blue", "green"] as const),
    outerTrackLength: 52,
    homeStretchLength: 5,
    startOffsets: Object.freeze([0, 13, 26, 39] as const),
    safeTrackIndices: Object.freeze([]),
    flightEntryOffset: 17,
    flightExitOffset: 29,
  });

/**
 * Creates only the logical route graph. Pixel coordinates, colored jump cells
 * and flight shortcuts are presentation/rule data layered on top later.
 */
export function createClassicBoard(
  overrides: Partial<ClassicBoardLayoutConfig> = {},
): BoardDefinition {
  const config: ClassicBoardLayoutConfig = {
    ...DEFAULT_CLASSIC_BOARD_LAYOUT,
    ...overrides,
  };
  validateLayout(config);

  const safeIndices = new Set(config.safeTrackIndices);
  const trackNodes = Array.from(
    { length: config.outerTrackLength },
    (_, index) => ({
      id: trackNodeId(index),
      kind: "track" as const,
      safe: safeIndices.has(index),
      ownerId: null,
    }),
  );

  const privateNodes = config.playerIds.flatMap((playerId) => [
    {
      id: `${playerId}-launch`,
      kind: "launch" as const,
      safe: true,
      ownerId: playerId,
    },
    ...Array.from({ length: config.homeStretchLength }, (_, index) => ({
      id: `${playerId}-home-${index + 1}`,
      kind: "home-stretch" as const,
      safe: true,
      ownerId: playerId,
    })),
    {
      id: `${playerId}-finish`,
      kind: "finish" as const,
      safe: true,
      ownerId: playerId,
    },
  ]);

  const routes = config.playerIds.map((playerId, playerIndex) => {
    const startOffset = config.startOffsets[playerIndex];
    if (startOffset === undefined) {
      throw new Error(`Missing start offset for player ${playerId}.`);
    }
    const outerRoute = Array.from(
      { length: config.outerTrackLength },
      (_, step) => trackNodeId((startOffset + step) % config.outerTrackLength),
    );
    const homeRoute = Array.from(
      { length: config.homeStretchLength },
      (_, index) => `${playerId}-home-${index + 1}`,
    );
    return {
      playerId,
      nodeIds: [
        `${playerId}-launch`,
        ...outerRoute,
        ...homeRoute,
        `${playerId}-finish`,
      ],
    };
  });

  const specialMoves = config.playerIds.flatMap((playerId, playerIndex) => {
    const startOffset = config.startOffsets[playerIndex]!;
    const relativeColorOffsets = Array.from(
      { length: Math.floor((config.outerTrackLength - 2) / 4) + 1 },
      (_, index) => 1 + index * 4,
    ).filter((offset) => offset + 4 < config.outerTrackLength);

    const colorJumps = relativeColorOffsets.map((fromOffset) => ({
      playerId,
      kind: "color-jump" as const,
      fromNodeId: trackNodeId(
        (startOffset + fromOffset) % config.outerTrackLength,
      ),
      toNodeId: trackNodeId(
        (startOffset + fromOffset + 4) % config.outerTrackLength,
      ),
      viaNodeIds: [],
    }));

    return [
      ...colorJumps,
      {
        playerId,
        kind: "flight" as const,
        fromNodeId: trackNodeId(
          (startOffset + config.flightEntryOffset) % config.outerTrackLength,
        ),
        toNodeId: trackNodeId(
          (startOffset + config.flightExitOffset) % config.outerTrackLength,
        ),
        viaNodeIds: [],
      },
    ];
  });

  return createBoardDefinition(
    [...trackNodes, ...privateNodes],
    routes,
    specialMoves,
  );
}

function trackNodeId(index: number): string {
  return `track-${index.toString().padStart(2, "0")}`;
}

function validateLayout(config: ClassicBoardLayoutConfig): void {
  if (new Set(config.playerIds).size !== 4) {
    throw new Error("Classic board requires four unique player IDs.");
  }
  if (!Number.isInteger(config.outerTrackLength) || config.outerTrackLength < 4) {
    throw new Error("Outer track length must be a whole number of at least four.");
  }
  if (!Number.isInteger(config.homeStretchLength) || config.homeStretchLength < 1) {
    throw new Error("Home stretch length must be a positive whole number.");
  }
  for (const offset of config.startOffsets) {
    if (!Number.isInteger(offset) || offset < 0 || offset >= config.outerTrackLength) {
      throw new Error(`Invalid start offset: ${offset}`);
    }
  }
  if (new Set(config.startOffsets).size !== 4) {
    throw new Error("Each player must have a unique start offset.");
  }
  for (const index of config.safeTrackIndices) {
    if (!Number.isInteger(index) || index < 0 || index >= config.outerTrackLength) {
      throw new Error(`Invalid safe track index: ${index}`);
    }
  }
  for (const offset of [config.flightEntryOffset, config.flightExitOffset]) {
    if (!Number.isInteger(offset) || offset < 0 || offset >= config.outerTrackLength) {
      throw new Error(`Invalid flight offset: ${offset}`);
    }
  }
  if (config.flightExitOffset <= config.flightEntryOffset) {
    throw new Error("Flight exit must be ahead of the flight entry.");
  }
}
