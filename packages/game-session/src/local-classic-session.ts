import {
  applyDiceRoll,
  applyPieceSelection,
  chooseAiPiece,
  createInitialClassicGameState,
  getActivePlayer,
  getLegalPieceIds,
  rollSixSided,
  type BoardDefinition,
  type ClassicGameState,
  type ClassicRuleset,
  type GameEvent,
  type PieceId,
  type PlayerId,
  type RandomSource,
} from "@orange-ludo/game-core";

export type SessionActionSource = "human" | "ai" | "timeout";

export type SessionAction =
  | {
      readonly type: "roll";
      readonly source: SessionActionSource;
      readonly playerId: PlayerId;
      readonly value: number;
    }
  | {
      readonly type: "select-piece";
      readonly source: SessionActionSource;
      readonly playerId: PlayerId;
      readonly pieceId: PieceId;
    };

export interface SessionStep {
  readonly action: SessionAction;
  readonly state: ClassicGameState;
  readonly events: readonly GameEvent[];
  /** UI restarts its countdown with this value after the animation queue ends. */
  readonly nextActionTimeoutMs: number | null;
}

export interface LocalClassicSessionOptions {
  readonly playerIds: readonly PlayerId[];
  readonly humanPlayerIds: readonly PlayerId[];
  readonly board: BoardDefinition;
  readonly ruleset: ClassicRuleset;
  readonly random: RandomSource;
  readonly initialState?: ClassicGameState;
}

/**
 * Orchestrates one local human-vs-AI match one atomic action at a time.
 * It owns no timers or animation objects, which keeps it reusable in Cocos,
 * automated tests and a future authoritative server.
 */
export class LocalClassicSession {
  private currentState: ClassicGameState;
  private readonly humanPlayerIds: ReadonlySet<PlayerId>;
  private readonly board: BoardDefinition;
  private readonly ruleset: ClassicRuleset;
  private readonly random: RandomSource;

  constructor(options: LocalClassicSessionOptions) {
    validatePlayers(options.playerIds, options.humanPlayerIds, options.ruleset);
    this.board = options.board;
    this.ruleset = options.ruleset;
    this.random = options.random;
    this.humanPlayerIds = new Set(options.humanPlayerIds);
    this.currentState =
      options.initialState ??
      createInitialClassicGameState(options.playerIds, options.board, options.ruleset);
  }

  get state(): ClassicGameState {
    return this.currentState;
  }

  get actionTimeoutMs(): number {
    return this.ruleset.config.actionTimeoutMs;
  }

  get activePlayerId(): PlayerId {
    return getActivePlayer(this.currentState).id;
  }

  get isHumanTurn(): boolean {
    return this.humanPlayerIds.has(this.activePlayerId);
  }

  get legalPieceIds(): readonly PieceId[] {
    if (
      this.currentState.phase !== "awaiting-piece" ||
      this.currentState.pendingRoll === null
    ) {
      return [];
    }
    return getLegalPieceIds(
      this.currentState,
      this.activePlayerId,
      this.currentState.pendingRoll,
      this.board,
      this.ruleset,
    );
  }

  rollForHuman(playerId: PlayerId): SessionStep {
    this.assertHumanAction(playerId);
    return this.roll(playerId, "human");
  }

  selectPieceForHuman(playerId: PlayerId, pieceId: PieceId): SessionStep {
    this.assertHumanAction(playerId);
    return this.selectPiece(playerId, pieceId, "human");
  }

  /** Performs one roll or piece choice for the active AI. */
  performAiAction(): SessionStep {
    if (this.currentState.phase === "ended") {
      throw new Error("The match has already ended.");
    }
    if (this.isHumanTurn) {
      throw new Error(`Player ${this.activePlayerId} is controlled by a human.`);
    }
    return this.performAutomaticAction("ai");
  }

  /**
   * Default 15-second timeout policy: roll automatically, or choose a legal
   * piece using the same transparent baseline strategy as the AI.
   */
  handleTimeout(playerId: PlayerId): SessionStep {
    this.assertActivePlayer(playerId);
    if (this.currentState.phase === "ended") {
      throw new Error("The match has already ended.");
    }
    return this.performAutomaticAction("timeout");
  }

  private performAutomaticAction(source: "ai" | "timeout"): SessionStep {
    const playerId = this.activePlayerId;
    if (this.currentState.phase === "awaiting-roll") {
      return this.roll(playerId, source);
    }
    if (this.currentState.phase === "awaiting-piece") {
      const choice = chooseAiPiece(
        this.currentState,
        this.board,
        this.ruleset,
        this.random,
      );
      return this.selectPiece(playerId, choice.pieceId, source);
    }
    throw new Error("The match has already ended.");
  }

  private roll(playerId: PlayerId, source: SessionActionSource): SessionStep {
    this.assertActivePlayer(playerId);
    const value = rollSixSided(this.random);
    const transition = applyDiceRoll(
      this.currentState,
      playerId,
      value,
      this.board,
      this.ruleset,
    );
    this.currentState = transition.state;
    return this.createStep(
      { type: "roll", source, playerId, value },
      transition.events,
    );
  }

  private selectPiece(
    playerId: PlayerId,
    pieceId: PieceId,
    source: SessionActionSource,
  ): SessionStep {
    this.assertActivePlayer(playerId);
    const transition = applyPieceSelection(
      this.currentState,
      playerId,
      pieceId,
      this.board,
      this.ruleset,
    );
    this.currentState = transition.state;
    return this.createStep(
      { type: "select-piece", source, playerId, pieceId },
      transition.events,
    );
  }

  private createStep(action: SessionAction, events: readonly GameEvent[]): SessionStep {
    return {
      action,
      state: this.currentState,
      events,
      nextActionTimeoutMs:
        this.currentState.phase === "ended"
          ? null
          : this.ruleset.config.actionTimeoutMs,
    };
  }

  private assertHumanAction(playerId: PlayerId): void {
    this.assertActivePlayer(playerId);
    if (!this.humanPlayerIds.has(playerId)) {
      throw new Error(`Player ${playerId} is controlled by AI.`);
    }
    if (this.currentState.phase === "ended") {
      throw new Error("The match has already ended.");
    }
  }

  private assertActivePlayer(playerId: PlayerId): void {
    if (this.activePlayerId !== playerId) {
      throw new Error(`It is not ${playerId}'s turn.`);
    }
  }
}

function validatePlayers(
  playerIds: readonly PlayerId[],
  humanPlayerIds: readonly PlayerId[],
  ruleset: ClassicRuleset,
): void {
  if (playerIds.length !== ruleset.config.playerCount) {
    throw new Error(
      `Expected ${ruleset.config.playerCount} players, received ${playerIds.length}.`,
    );
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error("Player IDs must be unique.");
  }
  if (humanPlayerIds.length < 1) {
    throw new Error("A local match requires at least one human player.");
  }
  if (new Set(humanPlayerIds).size !== humanPlayerIds.length) {
    throw new Error("Human player IDs must be unique.");
  }
  for (const humanPlayerId of humanPlayerIds) {
    if (!playerIds.includes(humanPlayerId)) {
      throw new Error(`Unknown human player: ${humanPlayerId}.`);
    }
  }
}
