import { describe, expect, it } from "vitest";
import {
  applyAction,
  createDeck,
  createHand,
  createNextHand,
  legalActionsFor,
  toClientView,
} from "../src/game";
import type { Card, GameConfig, PlayerId } from "../src/types";

const CONFIG: GameConfig = {
  startingChips: 1000,
  smallBlind: 5,
  bigBlind: 10,
  enforceMinRaise: false,
};

function card(id: string): Card {
  const found = createDeck().find((c) => c.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

function deck(ids: string[]): Card[] {
  const chosen = ids.map(card);
  const chosenIds = new Set(ids);
  return [...chosen, ...createDeck().filter((c) => !chosenIds.has(c.id))];
}

describe("texas poker rules", () => {
  it("posts heads-up blinds and starts preflop with the dealer acting first", () => {
    const game = createHand("p1", deck([]), CONFIG);

    expect(game.players.p1.chips).toBe(995);
    expect(game.players.p1.streetBet).toBe(5);
    expect(game.players.p2.chips).toBe(990);
    expect(game.players.p2.streetBet).toBe(10);
    expect(game.pot).toBe(15);
    expect(game.currentBet).toBe(10);
    expect(game.actionOn).toBe("p1");
    expect(game.street).toBe("preflop");
  });

  it("advances streets after both players have matched the bet", () => {
    let game = createHand("p1", deck([]), CONFIG);

    game = applyAction(game, "p1", { type: "call" });
    expect(game.street).toBe("preflop");
    expect(game.actionOn).toBe("p2");

    game = applyAction(game, "p2", { type: "check" });
    expect(game.street).toBe("flop");
    expect(game.communityCards).toHaveLength(3);
    expect(game.currentBet).toBe(0);
    expect(game.actionOn).toBe("p2");

    game = applyAction(game, "p2", { type: "check" });
    game = applyAction(game, "p1", { type: "check" });
    expect(game.street).toBe("turn");
    expect(game.communityCards).toHaveLength(4);
  });

  it("supports bet, raise, call, and moves chips into the pot", () => {
    let game = createHand("p1", deck([]), CONFIG);
    game = applyAction(game, "p1", { type: "call" });
    game = applyAction(game, "p2", { type: "check" });

    game = applyAction(game, "p2", { type: "bet", amount: 20 });
    expect(game.currentBet).toBe(20);
    expect(game.players.p2.streetBet).toBe(20);
    expect(game.pot).toBe(40);

    game = applyAction(game, "p1", { type: "raise", amount: 60 });
    expect(game.currentBet).toBe(60);
    expect(game.players.p1.streetBet).toBe(60);
    expect(game.pot).toBe(100);

    game = applyAction(game, "p2", { type: "call" });
    expect(game.street).toBe("turn");
    expect(game.pot).toBe(140);
  });

  it("awards the pot immediately when a player folds", () => {
    let game = createHand("p1", deck([]), CONFIG);
    game = applyAction(game, "p1", { type: "fold" });

    expect(game.phase).toBe("finished");
    expect(game.winner).toBe("p2");
    expect(game.winReason).toBe("fold");
    expect(game.players.p2.chips).toBe(1005);
  });

  it("runs showdown and awards the better hand", () => {
    const fixture = deck([
      "A-spades",
      "A-hearts",
      "K-spades",
      "Q-hearts",
      "2-clubs",
      "7-diamonds",
      "9-hearts",
      "J-clubs",
      "4-spades",
    ]);
    let game = createHand("p1", fixture, CONFIG);
    game = applyAction(game, "p1", { type: "call" });
    game = applyAction(game, "p2", { type: "check" });
    game = applyAction(game, "p2", { type: "check" });
    game = applyAction(game, "p1", { type: "check" });
    game = applyAction(game, "p2", { type: "check" });
    game = applyAction(game, "p1", { type: "check" });
    game = applyAction(game, "p2", { type: "check" });
    game = applyAction(game, "p1", { type: "check" });

    expect(game.phase).toBe("finished");
    expect(game.street).toBe("showdown");
    expect(game.winner).toBe("p1");
    expect(game.winReason).toBe("showdown");
    expect(game.players.p1.chips).toBe(1010);
  });

  it("rejects illegal actions", () => {
    const game = createHand("p1", deck([]), CONFIG);

    expect(() => applyAction(game, "p2", { type: "call" })).toThrow(
      "not your turn",
    );
    expect(() => applyAction(game, "p1", { type: "check" })).toThrow(
      "Cannot check",
    );
    expect(() =>
      applyAction(game, "p1", { type: "raise", amount: 12 }),
    ).toThrow("Minimum raise");
  });

  it("crops opponent hole cards and deck order from active views", () => {
    const game = createHand("p1", deck([]), CONFIG);
    const view = toClientView(game, "p1");
    const serialized = JSON.stringify(view);

    expect(view.myHoleCards).toEqual(game.players.p1.holeCards);
    expect(view.opponentHoleCards).toBeNull();
    expect(view.opponentHoleCount).toBe(2);
    for (const secret of game.players.p2.holeCards) {
      expect(serialized).not.toContain(secret.id);
    }
    expect(serialized).not.toContain(game.deck[0].id);
  });

  it("reveals both hole-card sets after showdown", () => {
    let game = createHand("p1", deck([]), CONFIG);
    game = applyAction(game, "p1", { type: "call" });
    for (const player of [
      "p2",
      "p2",
      "p1",
      "p2",
      "p1",
      "p2",
      "p1",
    ] as PlayerId[]) {
      game = applyAction(game, player, { type: "check" });
    }

    const view = toClientView(game, "p1");
    expect(view.opponentHoleCards).toEqual(game.players.p2.holeCards);
  });

  it("computes legal actions for the active player", () => {
    const game = createHand("p1", deck([]), CONFIG);
    const legal = legalActionsFor(game, "p1");

    expect(legal.canFold).toBe(true);
    expect(legal.canCall).toBe(true);
    expect(legal.callAmount).toBe(5);
    expect(legal.canCheck).toBe(false);
    expect(legal.minRaiseTo).toBe(15);
    expect(toClientView(game, "p1").settings.enforceMinRaise).toBe(false);
  });

  it("can enforce standard minimum raises when configured", () => {
    const game = createHand("p1", deck([]), {
      ...CONFIG,
      enforceMinRaise: true,
    });
    const legal = legalActionsFor(game, "p1");

    expect(legal.minRaiseTo).toBe(20);
    expect(toClientView(game, "p1").settings.enforceMinRaise).toBe(true);
  });

  it("creates the next hand with preserved stacks and alternating dealer", () => {
    let game = createHand("p1", deck([]), CONFIG);
    game = applyAction(game, "p1", { type: "fold" });

    const next = createNextHand(game, deck(["K-spades", "Q-spades"]), CONFIG);

    expect(next.handNumber).toBe(2);
    expect(next.dealer).toBe("p2");
    expect(next.players.p2.chips).toBe(1000);
    expect(next.players.p1.chips).toBe(985);
    expect(next.pot).toBe(15);
    expect(next.actionOn).toBe("p2");
    expect(next.phase).toBe("betting");
    expect(next.players.p1.holeCards.map((c) => c.id)).toEqual([
      "K-spades",
      "2-spades",
    ]);

    const view = toClientView(game, "p1");
    expect(view.matchOver).toBe(false);
    expect(view.canStartNextHand).toBe(true);
  });

  it("marks the match over and blocks the next hand when a player is out of chips", () => {
    let game = createHand("p1", deck([]), CONFIG, 1, { p1: 5, p2: 1000 });
    game = applyAction(game, "p1", { type: "fold" });

    const view = toClientView(game, "p1");

    expect(view.matchOver).toBe(true);
    expect(view.matchWinner).toBe("opp");
    expect(view.canStartNextHand).toBe(false);
    expect(() => createNextHand(game, deck([]), CONFIG)).toThrow(
      "Match is over",
    );
  });
});
