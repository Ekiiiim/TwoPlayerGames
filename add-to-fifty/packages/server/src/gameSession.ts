import {
  createDeck,
  createGame,
  playCard,
  shuffleDeck,
  toClientView,
  type Card,
  type GameState,
  type PlayerId,
} from "@add-to-fifty/shared";

export interface Player {
  id: PlayerId;
  socketId: string | null;
  sessionToken: string;
}

export class GameSession {
  state: GameState | null = null;
  players: Partial<Record<PlayerId, Player>> = {};
  emptySince: number | null = null;

  constructor(
    private readonly makeDeck: () => Card[] = () => shuffleDeck(createDeck()),
    private readonly firstPlayer: PlayerId = "p1",
  ) {}

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
    this.state = createGame(this.firstPlayer, this.makeDeck());
  }

  play(player: PlayerId, cardId: string, kingDelta?: number): void {
    if (!this.state) throw new Error("Game has not started");
    this.state = playCard(this.state, player, cardId, kingDelta);
  }

  viewFor(id: PlayerId) {
    if (!this.state) return null;
    return toClientView(this.state, id);
  }
}
