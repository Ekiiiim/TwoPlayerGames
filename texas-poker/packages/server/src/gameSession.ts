import {
  createDeck,
  createHand,
  createNextHand,
  shuffleDeck,
  toClientView,
  applyAction,
  type Card,
  type GameConfig,
  type GameState,
  type PlayerAction,
  type PlayerId,
} from "@texas-poker/shared";

export interface Player {
  id: PlayerId;
  socketId: string | null;
  sessionToken: string;
}

export class GameSession {
  state: GameState | null = null;
  players: Partial<Record<PlayerId, Player>> = {};
  emptySince: number | null = null;
  private config: GameConfig;

  constructor(
    private readonly makeDeck: () => Card[] = () => shuffleDeck(createDeck()),
    config: GameConfig,
  ) {
    this.config = config;
  }

  addPlayer(id: PlayerId, socketId: string, sessionToken: string): void {
    this.players[id] = { id, socketId, sessionToken };
    this.emptySince = null;
  }

  isFull(): boolean {
    return !!this.players.p1 && !!this.players.p2;
  }

  anyConnected(): boolean {
    return !!this.players.p1?.socketId || !!this.players.p2?.socketId;
  }

  markConnected(id: PlayerId, socketId: string): void {
    const player = this.players[id];
    if (player) player.socketId = socketId;
    this.emptySince = null;
  }

  markDisconnected(id: PlayerId, now = Date.now()): void {
    const player = this.players[id];
    if (player) player.socketId = null;
    if (!this.anyConnected() && this.emptySince === null) this.emptySince = now;
  }

  isSweepable(ttlMs: number, now = Date.now()): boolean {
    return this.emptySince !== null && now - this.emptySince >= ttlMs;
  }

  start(): void {
    this.state = createHand("p1", this.makeDeck(), this.config);
  }

  nextHand(): void {
    if (!this.state) throw new Error("Hand has not started");
    this.state = createNextHand(this.state, this.makeDeck(), this.config);
  }

  restartMatch(): void {
    this.state = createHand("p1", this.makeDeck(), this.config);
  }

  updateSettings(settings: Partial<Pick<GameConfig, "enforceMinRaise">>): void {
    this.config = { ...this.config, ...settings };
    if (this.state) {
      const baseRaiseIncrement = this.config.enforceMinRaise
        ? this.config.bigBlind
        : 5;
      this.state = {
        ...this.state,
        enforceMinRaise: this.config.enforceMinRaise,
        baseRaiseIncrement,
        minRaise: baseRaiseIncrement,
      };
    }
  }

  dispatch(player: PlayerId, action: PlayerAction): void {
    if (!this.state) throw new Error("Hand has not started");
    this.state = applyAction(this.state, player, action);
  }

  viewFor(id: PlayerId) {
    if (!this.state) return null;
    return toClientView(this.state, id);
  }
}
