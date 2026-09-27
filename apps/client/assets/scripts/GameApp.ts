import {
  _decorator,
  Color,
  Component,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Node,
  profiler,
  ResolutionPolicy,
  UITransform,
  Vec3,
  VerticalTextAlignment,
  view,
} from "cc";
import {
  createClientViewState,
  createPlaceholderPortraitLayout,
  planAnimationCues,
  type NormalizedPoint,
} from "@orange-ludo/client-model";
import {
  createClassicBoard,
  createClassicRuleset,
  type GameEvent,
  type PieceId,
  type PlayerId,
} from "@orange-ludo/game-core";
import {
  LocalClassicSession,
  type SessionStep,
} from "@orange-ludo/game-session";

const { ccclass } = _decorator;

const DESIGN_WIDTH = 750;
const DESIGN_HEIGHT = 1334;
const HUMAN_PLAYER_ID = "red";
const PLAYER_IDS = ["red", "yellow", "blue", "green"] as const;

const PALETTE = {
  background: new Color(246, 242, 232, 255),
  panel: new Color(255, 252, 244, 255),
  ink: new Color(42, 46, 54, 255),
  muted: new Color(126, 128, 133, 255),
  line: new Color(214, 207, 194, 255),
  track: new Color(235, 230, 219, 255),
  red: new Color(225, 78, 68, 255),
  yellow: new Color(244, 185, 56, 255),
  blue: new Color(58, 133, 216, 255),
  green: new Color(70, 167, 112, 255),
  white: new Color(255, 255, 255, 255),
};

const PLAYER_NAMES: Readonly<Record<string, string>> = {
  red: "你 · 红方",
  yellow: "AI · 黄方",
  blue: "AI · 蓝方",
  green: "AI · 绿方",
};

@ccclass("GameApp")
export class GameApp extends Component {
  private readonly board = createClassicBoard();
  private readonly ruleset = createClassicRuleset();
  private readonly layout = createPlaceholderPortraitLayout(
    this.board,
    PLAYER_IDS,
    this.ruleset.config.piecesPerPlayer,
  );
  private readonly session = new LocalClassicSession({
    playerIds: PLAYER_IDS,
    humanPlayerIds: [HUMAN_PLAYER_ID],
    board: this.board,
    ruleset: this.ruleset,
    random: { next: () => Math.random() },
  });

  private pieceLayer!: Node;
  private timerGraphics!: Graphics;
  private turnLabel!: Label;
  private timerLabel!: Label;
  private diceLabel!: Label;
  private statusLabel!: Label;
  private actionButtonGraphics!: Graphics;
  private actionButtonLabel!: Label;

  private remainingTurnMs = this.ruleset.config.actionTimeoutMs;
  private aiDelayMs = 650;
  private busyMs = 0;
  private lastMessage = "轮到你了，点击掷骰子";

  protected onLoad(): void {
    profiler.hideStats();
    view.setDesignResolutionSize(
      DESIGN_WIDTH,
      DESIGN_HEIGHT,
      ResolutionPolicy.FIXED_WIDTH,
    );
    this.buildInterface();
    this.renderState();
  }

  protected update(deltaTime: number): void {
    if (this.session.state.phase === "ended") return;

    const elapsedMs = deltaTime * 1000;
    if (this.busyMs > 0) {
      this.busyMs = Math.max(0, this.busyMs - elapsedMs);
      if (this.busyMs === 0) this.renderState();
      return;
    }

    this.remainingTurnMs = Math.max(0, this.remainingTurnMs - elapsedMs);
    this.renderTimer();

    if (!this.session.isHumanTurn) {
      this.aiDelayMs -= elapsedMs;
      if (this.aiDelayMs <= 0) {
        this.performStep(() => this.session.performAiAction());
      }
      return;
    }

    if (this.remainingTurnMs <= 0) {
      const playerId = this.session.activePlayerId;
      this.lastMessage = "操作超时，已自动处理";
      this.performStep(() => this.session.handleTimeout(playerId));
    }
  }

  private buildInterface(): void {
    this.drawPageBackground();
    this.createText("Orange Ludo", 38, { x: 0.5, y: 0.035 }, PALETTE.ink, true);
    this.turnLabel = this.createText("", 28, this.layout.hud.turnIndicator, PALETTE.ink, true);
    this.timerLabel = this.createText("", 22, this.layout.hud.timer, PALETTE.muted, false);
    this.drawTimerBar();
    this.drawBoard();

    this.diceLabel = this.createText("-", 62, this.layout.hud.dice, PALETTE.ink, true);
    this.statusLabel = this.createText(
      "",
      23,
      { x: 0.5, y: 0.845 },
      PALETTE.muted,
      false,
      650,
      58,
    );
    this.buildActionButton();
    this.createText(
      "开发版界面 · 规则核心与最终美术相互独立",
      18,
      { x: 0.5, y: 0.968 },
      PALETTE.muted,
      false,
    );

    this.pieceLayer = this.makeNode("Pieces", this.node);
  }

  private drawPageBackground(): void {
    const background = this.makeNode("Background", this.node);
    const graphics = background.addComponent(Graphics);
    graphics.fillColor = PALETTE.background;
    graphics.rect(-DESIGN_WIDTH / 2, -DESIGN_HEIGHT / 2, DESIGN_WIDTH, DESIGN_HEIGHT);
    graphics.fill();
  }

  private drawTimerBar(): void {
    const timerNode = this.makeNode("TimerBar", this.node);
    timerNode.setPosition(0, DESIGN_HEIGHT / 2 - 188);
    this.timerGraphics = timerNode.addComponent(Graphics);
  }

  private drawBoard(): void {
    const boardNode = this.makeNode("Board", this.node);
    const graphics = boardNode.addComponent(Graphics);
    const viewport = this.layout.boardViewport;
    const topLeft = this.pagePoint({ x: viewport.x, y: viewport.y });
    const width = viewport.width * DESIGN_WIDTH;
    const height = viewport.height * DESIGN_HEIGHT;

    graphics.fillColor = PALETTE.panel;
    graphics.strokeColor = PALETTE.line;
    graphics.lineWidth = 3;
    graphics.roundRect(topLeft.x, topLeft.y - height, width, height, 28);
    graphics.fill();
    graphics.stroke();

    const center = this.boardPoint({ x: 0.5, y: 0.5 });
    graphics.fillColor = new Color(236, 222, 196, 255);
    graphics.circle(center.x, center.y, 56);
    graphics.fill();

    for (const boardNodeDefinition of Object.values(this.board.nodes)) {
      const normalized = this.layout.nodePositions[boardNodeDefinition.id];
      if (!normalized) continue;
      const point = this.boardPoint(normalized);
      graphics.fillColor = boardNodeDefinition.ownerId
        ? this.playerColor(boardNodeDefinition.ownerId, 115)
        : PALETTE.track;
      graphics.strokeColor = boardNodeDefinition.safe
        ? PALETTE.white
        : PALETTE.line;
      graphics.lineWidth = boardNodeDefinition.safe ? 3 : 1.5;
      graphics.circle(point.x, point.y, boardNodeDefinition.kind === "finish" ? 12 : 9);
      graphics.fill();
      graphics.stroke();
    }

    PLAYER_IDS.forEach((playerId, index) => {
      const namePoint: readonly NormalizedPoint[] = [
        { x: 0.17, y: 0.87 },
        { x: 0.83, y: 0.87 },
        { x: 0.83, y: 0.13 },
        { x: 0.17, y: 0.13 },
      ];
      const point = namePoint[index];
      if (point) {
        this.createText(
          PLAYER_NAMES[playerId] ?? playerId,
          18,
          this.boardToPageNormalized(point),
          this.playerColor(playerId),
          true,
          150,
          32,
        );
      }
    });
  }

  private buildActionButton(): void {
    const button = this.makeNode("ActionButton", this.node);
    const position = this.pagePoint(this.layout.hud.actionButton);
    button.setPosition(position);
    button.addComponent(UITransform).setContentSize(330, 92);
    this.actionButtonGraphics = button.addComponent(Graphics);

    const labelNode = this.makeNode("Label", button);
    labelNode.addComponent(UITransform).setContentSize(300, 80);
    this.actionButtonLabel = labelNode.addComponent(Label);
    this.configureLabel(this.actionButtonLabel, 30, PALETTE.white, true);

    button.on(Node.EventType.TOUCH_END, this.onActionPressed, this);
  }

  private onActionPressed(): void {
    if (
      this.busyMs > 0 ||
      !this.session.isHumanTurn ||
      this.session.state.phase !== "awaiting-roll"
    ) {
      return;
    }
    this.performStep(() => this.session.rollForHuman(HUMAN_PLAYER_ID));
  }

  private onPiecePressed(pieceId: PieceId): void {
    if (
      this.busyMs > 0 ||
      !this.session.isHumanTurn ||
      this.session.state.phase !== "awaiting-piece" ||
      !this.session.legalPieceIds.includes(pieceId)
    ) {
      return;
    }
    this.performStep(() =>
      this.session.selectPieceForHuman(HUMAN_PLAYER_ID, pieceId),
    );
  }

  private performStep(action: () => SessionStep): void {
    try {
      const step = action();
      const cues = planAnimationCues(step.events);
      const cueDuration = cues.reduce((sum, cue) => sum + cue.durationMs, 0);
      this.busyMs = Math.min(700, cueDuration);
      this.aiDelayMs = 650;
      this.remainingTurnMs = step.nextActionTimeoutMs ?? 0;
      this.lastMessage = this.describeEvents(step.events);
      this.renderState();
    } catch (error) {
      this.lastMessage = error instanceof Error ? error.message : "操作失败";
      this.renderState();
    }
  }

  private renderState(): void {
    const state = this.session.state;
    const activeName = PLAYER_NAMES[this.session.activePlayerId] ?? this.session.activePlayerId;
    this.turnLabel.string = state.phase === "ended"
      ? `${PLAYER_NAMES[state.winnerId ?? ""] ?? state.winnerId} 获胜`
      : `第 ${state.turnNumber} 回合 · ${activeName}`;
    this.diceLabel.string = state.pendingRoll === null ? "–" : String(state.pendingRoll);
    this.statusLabel.string = this.lastMessage;

    const canRoll =
      this.session.isHumanTurn &&
      state.phase === "awaiting-roll" &&
      this.busyMs <= 0;
    this.actionButtonGraphics.clear();
    this.actionButtonGraphics.fillColor = canRoll
      ? PALETTE.red
      : new Color(178, 173, 164, 255);
    this.actionButtonGraphics.roundRect(-165, -46, 330, 92, 46);
    this.actionButtonGraphics.fill();
    this.actionButtonLabel.string = state.phase === "ended"
      ? "本局结束"
      : canRoll
        ? "掷骰子"
        : state.phase === "awaiting-piece" && this.session.isHumanTurn
          ? "请选择棋子"
          : "AI 思考中";

    this.renderPieces();
    this.renderTimer();
  }

  private renderPieces(): void {
    for (const child of [...this.pieceLayer.children]) child.destroy();

    const viewState = createClientViewState(
      this.session.state,
      this.board,
      this.layout,
      {
        legalPieceIds: this.session.isHumanTurn ? this.session.legalPieceIds : [],
        remainingTurnMs: this.remainingTurnMs,
        turnDurationMs: this.ruleset.config.actionTimeoutMs,
      },
    );

    for (const player of viewState.players) {
      for (const piece of player.pieces) {
        const pieceNode = this.makeNode(piece.id, this.pieceLayer);
        const point = this.boardPoint(piece.position);
        const stackOffset = piece.stackSize > 1
          ? (piece.stackIndex - (piece.stackSize - 1) / 2) * 9
          : 0;
        pieceNode.setPosition(point.x + stackOffset, point.y + stackOffset);
        pieceNode.addComponent(UITransform).setContentSize(54, 54);
        const graphics = pieceNode.addComponent(Graphics);

        if (piece.selectable) {
          graphics.strokeColor = PALETTE.white;
          graphics.lineWidth = 7;
          graphics.circle(0, 0, 25);
          graphics.stroke();
        }
        graphics.fillColor = this.playerColor(piece.ownerId);
        graphics.strokeColor = new Color(72, 64, 58, 210);
        graphics.lineWidth = 2;
        graphics.circle(0, 0, 19);
        graphics.fill();
        graphics.stroke();

        const shortId = piece.id.slice(piece.id.lastIndexOf("-") + 1);
        const numberNode = this.makeNode("Number", pieceNode);
        numberNode.addComponent(UITransform).setContentSize(36, 36);
        const number = numberNode.addComponent(Label);
        number.string = shortId;
        this.configureLabel(number, 17, PALETTE.white, true);

        if (piece.selectable) {
          pieceNode.on(
            Node.EventType.TOUCH_END,
            () => this.onPiecePressed(piece.id),
            this,
          );
        }
      }
    }
  }

  private renderTimer(): void {
    const total = this.ruleset.config.actionTimeoutMs;
    const ratio = total > 0 ? Math.max(0, Math.min(1, this.remainingTurnMs / total)) : 0;
    const seconds = Math.ceil(this.remainingTurnMs / 1000);
    this.timerLabel.string = this.session.state.phase === "ended"
      ? ""
      : `剩余 ${seconds} 秒`;

    this.timerGraphics.clear();
    this.timerGraphics.fillColor = new Color(221, 216, 205, 255);
    this.timerGraphics.roundRect(-230, -7, 460, 14, 7);
    this.timerGraphics.fill();
    if (ratio > 0) {
      this.timerGraphics.fillColor = ratio > 0.33
        ? this.playerColor(this.session.activePlayerId)
        : PALETTE.red;
      this.timerGraphics.roundRect(-230, -7, 460 * ratio, 14, 7);
      this.timerGraphics.fill();
    }
  }

  private describeEvents(events: readonly GameEvent[]): string {
    const roll = events.find((event) => event.type === "dice-rolled");
    const ended = events.find((event) => event.type === "game-ended");
    if (ended?.type === "game-ended") {
      return `${PLAYER_NAMES[ended.winnerId] ?? ended.winnerId}率先让四架飞机抵达终点`;
    }
    if (events.some((event) => event.type === "piece-returned-to-base")) {
      return "有飞机返回基地";
    }
    if (events.some((event) => event.type === "special-move-taken")) {
      return "触发跳跃或飞行捷径";
    }
    if (events.some((event) => event.type === "movement-blocked")) {
      return "前方有叠机阻挡，已停在阻挡前";
    }
    if (events.some((event) => event.type === "no-legal-move")) {
      return roll?.type === "dice-rolled"
        ? `掷出 ${roll.roll}，没有可移动的飞机`
        : "没有可移动的飞机";
    }
    if (events.some((event) => event.type === "piece-moved" || event.type === "piece-taken-off")) {
      return "飞机移动完成";
    }
    if (roll?.type === "dice-rolled") {
      return `掷出 ${roll.roll}${roll.roll === 6 ? "，可以再次行动" : ""}`;
    }
    return this.lastMessage;
  }

  private createText(
    name: string,
    fontSize: number,
    position: NormalizedPoint,
    color: Color,
    bold: boolean,
    width = 500,
    height = 48,
  ): Label {
    const textNode = this.makeNode(name, this.node);
    textNode.setPosition(this.pagePoint(position));
    textNode.addComponent(UITransform).setContentSize(width, height);
    const label = textNode.addComponent(Label);
    label.string = name;
    this.configureLabel(label, fontSize, color, bold);
    return label;
  }

  private configureLabel(label: Label, fontSize: number, color: Color, bold: boolean): void {
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.25);
    label.color = color;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    label.isBold = bold;
  }

  private makeNode(name: string, parent: Node): Node {
    const node = new Node(name);
    node.layer = this.node.layer;
    node.setParent(parent);
    return node;
  }

  private pagePoint(point: NormalizedPoint): Vec3 {
    return new Vec3(
      (point.x - 0.5) * DESIGN_WIDTH,
      (0.5 - point.y) * DESIGN_HEIGHT,
      0,
    );
  }

  private boardPoint(point: NormalizedPoint): Vec3 {
    return this.pagePoint(this.boardToPageNormalized(point));
  }

  private boardToPageNormalized(point: NormalizedPoint): NormalizedPoint {
    const viewport = this.layout.boardViewport;
    return {
      x: viewport.x + point.x * viewport.width,
      y: viewport.y + point.y * viewport.height,
    };
  }

  private playerColor(playerId: PlayerId, alpha = 255): Color {
    const base = playerId === "red"
      ? PALETTE.red
      : playerId === "yellow"
        ? PALETTE.yellow
        : playerId === "blue"
          ? PALETTE.blue
          : PALETTE.green;
    return new Color(base.r, base.g, base.b, alpha);
  }
}
