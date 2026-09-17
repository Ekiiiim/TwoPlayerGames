import {
  createDeck,
  createGame,
  playCard,
  shuffleDeck,
  toClientView,
  type Card,
  type ClientView,
  type GameState,
  type PlayerId,
} from "@add-to-fifty/shared";
import { PresenceSession } from "@tpg/server";

export class GameSession extends PresenceSession<GameState, ClientView> {
  constructor(
    private readonly makeDeck: () => Card[] = () => shuffleDeck(createDeck()),
    private readonly firstPlayer: PlayerId = "p1",
  ) {
    super();
  }

  start(): void {
    this.state = createGame(this.firstPlayer, this.makeDeck());
  }

  play(player: PlayerId, cardId: string, kingDelta?: number): void {
    if (!this.state) throw new Error("Game has not started");
    this.state = playCard(this.state, player, cardId, kingDelta);
  }

  viewFor(id: PlayerId): ClientView | null {
    if (!this.state) return null;
    return toClientView(this.state, id);
  }
}
