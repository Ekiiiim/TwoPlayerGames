import {
  createGame,
  toClientView,
  toReview,
  type GameState,
  type PlayerId,
} from "@bw/shared";

export interface Player {
  id: PlayerId;
  socketId: string | null; // null = 掉线
  sessionToken: string;
}

export class GameSession {
  state: GameState | null = null;
  players: Partial<Record<PlayerId, Player>> = {};
  // Timestamp (ms) when the room last had zero connected sockets, or null while
  // at least one player is online. Drives abandoned-room garbage collection so
  // tabs closed without an explicit leave_room don't leak sessions forever.
  emptySince: number | null = null;

  addPlayer(id: PlayerId, socketId: string, sessionToken: string) {
    this.players[id] = { id, socketId, sessionToken };
    this.emptySince = null;
  }

  isFull() {
    return !!this.players.p1 && !!this.players.p2;
  }

  anyConnected(): boolean {
    return !!this.players.p1?.socketId || !!this.players.p2?.socketId;
  }

  // Reattach a (re)connected socket and mark the room as live again.
  markConnected(id: PlayerId, socketId: string) {
    const p = this.players[id];
    if (p) p.socketId = socketId;
    this.emptySince = null;
  }

  // Drop a socket on disconnect; stamp emptySince once nobody is left online.
  markDisconnected(id: PlayerId, now = Date.now()) {
    const p = this.players[id];
    if (p) p.socketId = null;
    if (!this.anyConnected() && this.emptySince === null) this.emptySince = now;
  }

  // A room is sweepable once it has been fully empty for at least ttlMs.
  isSweepable(ttlMs: number, now = Date.now()): boolean {
    return this.emptySince !== null && now - this.emptySince >= ttlMs;
  }

  start(firstLeader: PlayerId) {
    this.state = createGame(firstLeader);
  }

  // Item 2: Guard against null state — callers must check state != null first,
  // but these methods also guard defensively and return null when state is absent.
  viewFor(id: PlayerId) {
    if (!this.state) return null;
    return toClientView(this.state, id);
  }

  reviewFor(id: PlayerId) {
    if (!this.state) return null;
    return toReview(this.state, id);
  }
}
