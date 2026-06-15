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

  viewFor(id: PlayerId) {
    return toClientView(this.state!, id);
  }

  reviewFor(id: PlayerId) {
    return toReview(this.state!, id);
  }
}
