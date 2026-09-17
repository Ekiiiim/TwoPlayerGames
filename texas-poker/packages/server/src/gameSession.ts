import {
  createDeck,
  createHand,
  createNextHand,
  shuffleDeck,
  toClientView,
  applyAction,
  type Card,
  type ClientView,
  type GameConfig,
  type GameState,
  type PlayerAction,
  type PlayerId,
} from "@texas-poker/shared";
import { PresenceSession } from "@tpg/server";

export class GameSession extends PresenceSession<GameState, ClientView> {
  private config: GameConfig;

  constructor(
    private readonly makeDeck: () => Card[] = () => shuffleDeck(createDeck()),
    config: GameConfig,
  ) {
    super();
    this.config = config;
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

  updateSettings(
    settings: Partial<Pick<GameConfig, "enforceMinRaise" | "startingChips">>,
  ): void {
    this.config = { ...this.config, ...settings };
    if (this.state) {
      const baseRaiseIncrement = this.config.enforceMinRaise
        ? this.config.bigBlind
        : 5;
      this.state = {
        ...this.state,
        startingChips: this.config.startingChips,
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

  viewFor(id: PlayerId): ClientView | null {
    if (!this.state) return null;
    return toClientView(this.state, id);
  }
}
