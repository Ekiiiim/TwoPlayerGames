import { createGame, toClientView, toReview, type GameState, type PlayerId } from '@bw/shared';

export interface Player {
  id: PlayerId;
  socketId: string | null; // null = 掉线
  sessionToken: string;
}

export class GameSession {
  state: GameState | null = null;
  players: Partial<Record<PlayerId, Player>> = {};

  addPlayer(id: PlayerId, socketId: string, sessionToken: string) {
    this.players[id] = { id, socketId, sessionToken };
  }

  isFull() {
    return !!this.players.p1 && !!this.players.p2;
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
