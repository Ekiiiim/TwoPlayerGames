import {
  createGame,
  toClientView,
  toReview,
  type ClientView,
  type GameReview,
  type GameState,
  type PlayerId,
} from "@bw/shared";
import { PresenceSession } from "@tpg/server";

export class GameSession extends PresenceSession<GameState, ClientView> {
  start(firstLeader: PlayerId): void {
    this.state = createGame(firstLeader);
  }

  viewFor(id: PlayerId): ClientView | null {
    if (!this.state) return null;
    return toClientView(this.state, id);
  }

  reviewFor(id: PlayerId): GameReview | null {
    if (!this.state) return null;
    return toReview(this.state, id);
  }
}
