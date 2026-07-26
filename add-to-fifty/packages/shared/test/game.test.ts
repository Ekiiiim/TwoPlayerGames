import { describe, expect, it } from "vitest";
import {
  createDeck,
  createGame,
  otherPlayer,
  playCard,
  rankDelta,
  toClientView,
} from "../src/game";
import type { Card, GameState, PlayerId } from "../src/types";

function card(rank: Card["rank"], id = `${rank}-test`): Card {
  return { id, rank, suit: "spades" };
}

function stateWithHands(
  hands: Record<PlayerId, Card[]>,
  deck: Card[] = [],
  total = 0,
  turn: PlayerId = "p1",
): GameState {
  return {
    deck,
    hands,
    discardTotal: total,
    turn,
    history: [],
    phase: "playing",
  };
}

describe("add-to-fifty rules", () => {
  it("builds a standard 52-card deck with stable unique ids", () => {
    const deck = createDeck();

    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
    expect(deck.filter((c) => c.rank === "K")).toHaveLength(4);
  });

  it("deals five cards to each player and leaves the rest in the deck", () => {
    const deck = createDeck();
    const game = createGame("p1", deck);

    expect(game.hands.p1).toEqual(deck.slice(0, 5));
    expect(game.hands.p2).toEqual(deck.slice(5, 10));
    expect(game.deck).toEqual(deck.slice(10));
    expect(game.turn).toBe("p1");
    expect(game.discardTotal).toBe(0);
  });

  it("maps numeric cards, A, J, Q, and K deltas", () => {
    expect(rankDelta(card("A"))).toBe(1);
    expect(rankDelta(card("10"))).toBe(10);
    expect(rankDelta(card("J"))).toBe(-10);
    expect(rankDelta(card("Q"))).toBe(0);
    expect(rankDelta(card("K"), -7)).toBe(-7);
    expect(rankDelta(card("K"), 10)).toBe(10);
  });

  it("requires K to choose an integer delta from -10 through 10", () => {
    expect(() => rankDelta(card("K"))).toThrow("K requires");
    expect(() => rankDelta(card("K"), 11)).toThrow("between -10 and 10");
    expect(() => rankDelta(card("K"), 1.5)).toThrow("integer");
    expect(() => rankDelta(card("5"), 1)).toThrow("Only K");
  });

  it("plays a card, adds its value, draws one replacement, and passes the turn", () => {
    const p1Card = card("9", "9S");
    const draw = card("2", "2S");
    const game = stateWithHands(
      { p1: [p1Card], p2: [card("3", "3S")] },
      [draw],
      20,
      "p1",
    );

    const next = playCard(game, "p1", p1Card.id);

    expect(next.discardTotal).toBe(29);
    expect(next.hands.p1).toEqual([draw]);
    expect(next.deck).toEqual([]);
    expect(next.turn).toBe("p2");
    expect(next.history).toEqual([
      { player: "p1", card: p1Card, delta: 9, total: 29 },
    ]);
  });

  it("does not draw when the deck is empty", () => {
    const p1Card = card("Q", "QS");
    const game = stateWithHands(
      { p1: [p1Card], p2: [card("3", "3S")] },
      [],
      12,
      "p1",
    );

    const next = playCard(game, "p1", p1Card.id);

    expect(next.hands.p1).toEqual([]);
    expect(next.deck).toEqual([]);
  });

  it("finishes immediately when the current player reaches fifty", () => {
    const p1Card = card("K", "KS");
    const game = stateWithHands(
      { p1: [p1Card], p2: [card("3", "3S")] },
      [],
      44,
      "p1",
    );

    const next = playCard(game, "p1", p1Card.id, 6);

    expect(next.phase).toBe("finished");
    expect(next.loser).toBe("p1");
    expect(next.discardTotal).toBe(50);
    expect(next.turn).toBe("p1");
  });

  it("rejects out-of-turn, missing-card, and already-finished plays", () => {
    const p1Card = card("2", "2S");
    const game = stateWithHands(
      { p1: [p1Card], p2: [card("3", "3S")] },
      [],
      0,
      "p2",
    );

    expect(() => playCard(game, "p1", p1Card.id)).toThrow("not your turn");
    expect(() => playCard(game, "p2", p1Card.id)).toThrow("not in hand");

    const finished = { ...game, phase: "finished" as const, loser: "p2" };
    expect(() => playCard(finished, "p2", "3S")).toThrow("not in progress");
  });

  it("keeps opponent hand and deck order out of each player's client view", () => {
    const secret = card("8", "8S");
    const deckSecret = card("K", "KH");
    const game = stateWithHands(
      { p1: [card("A", "AS")], p2: [secret] },
      [deckSecret],
      7,
      "p2",
    );

    const view = toClientView(game, "p1");
    const serialized = JSON.stringify(view);

    expect(view.myHand).toEqual(game.hands.p1);
    expect(view.opponentCardsLeft).toBe(1);
    expect(view.deckCount).toBe(1);
    expect(serialized).not.toContain(secret.id);
    expect(serialized).not.toContain(deckSecret.id);
  });

  it("reports winner and loser relative to the viewer", () => {
    const game = {
      ...stateWithHands({ p1: [], p2: [] }, [], 50, "p1"),
      phase: "finished" as const,
      loser: "p1" as const,
    };

    expect(toClientView(game, "p1").winner).toBe("opp");
    expect(toClientView(game, "p1").loser).toBe("me");
    expect(toClientView(game, "p2").winner).toBe("me");
    expect(toClientView(game, "p2").loser).toBe("opp");
    expect(otherPlayer("p1")).toBe("p2");
  });
});
