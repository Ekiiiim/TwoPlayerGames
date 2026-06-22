import { describe, it, expect } from "vitest";
import {
  colorOf,
  createGame,
  playCard,
  otherPlayer,
  toClientView,
  toReview,
} from "../src/game";
import type { Card, PlayerId } from "../src/types";

describe("colorOf", () => {
  it("even cards are black", () => {
    expect(colorOf(0)).toBe("black");
    expect(colorOf(8)).toBe("black");
  });
  it("odd cards are white", () => {
    expect(colorOf(1)).toBe("white");
    expect(colorOf(7)).toBe("white");
  });
});

describe("createGame", () => {
  it("deals 0..8 to both players", () => {
    const g = createGame("p1");
    expect([...g.hands.p1].sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect([...g.hands.p2].sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });
  it("starts at round 1, playing phase, given leader, zero scores", () => {
    const g = createGame("p2");
    expect(g.current.index).toBe(1);
    expect(g.current.leader).toBe("p2");
    expect(g.phase).toBe("playing");
    expect(g.scores).toEqual({ p1: 0, p2: 0 });
    expect(g.history).toEqual([]);
  });
});

describe("playCard happy path", () => {
  it("leader plays, then follower; higher card wins the round", () => {
    let g = createGame("p1"); // p1 leads
    g = playCard(g, "p1", 5); // leader
    expect(g.current.leaderCard).toBe(5);
    expect(g.hands.p1).not.toContain(5);
    g = playCard(g, "p2", 3); // follower (p2)
    // round resolved: p1 wins
    expect(g.scores).toEqual({ p1: 1, p2: 0 });
    expect(g.history).toHaveLength(1);
    expect(g.history[0]).toEqual({
      round: 1,
      leader: "p1",
      cards: { p1: 5, p2: 3 },
      winner: "p1",
    });
  });
  it("winner leads the next round", () => {
    let g = createGame("p1");
    g = playCard(g, "p1", 2);
    g = playCard(g, "p2", 6); // p2 wins
    expect(g.current.index).toBe(2);
    expect(g.current.leader).toBe("p2");
    expect(g.current.leaderCard).toBeUndefined();
  });
  it("otherPlayer flips id", () => {
    expect(otherPlayer("p1")).toBe("p2");
    expect(otherPlayer("p2")).toBe("p1");
  });
});

describe("playCard draw", () => {
  it("equal cards: no score, leader unchanged next round", () => {
    let g = createGame("p1");
    g = playCard(g, "p1", 4);
    g = playCard(g, "p2", 4); // draw
    expect(g.scores).toEqual({ p1: 0, p2: 0 });
    expect(g.history[0].winner).toBe("draw");
    expect(g.current.index).toBe(2);
    expect(g.current.leader).toBe("p1"); // unchanged
  });
});

describe("playCard validation", () => {
  it("rejects when it is not the player turn", () => {
    const g = createGame("p1"); // p1 leads
    expect(() => playCard(g, "p2", 3)).toThrow(/not your turn/i);
  });
  it("rejects leader playing a card they do not hold", () => {
    const g = createGame("p1");
    expect(() => playCard(g, "p1", 99)).toThrow(/not in hand/i);
  });
  it("rejects follower playing a card they do not hold", () => {
    let g = createGame("p1");
    g = playCard(g, "p1", 5);
    // p2 still holds 0..8; playing 99 is invalid
    expect(() => playCard(g, "p2", 99)).toThrow(/not in hand/i);
  });
  it("rejects play when game finished", () => {
    const g = { ...createGame("p1"), phase: "finished" as const };
    expect(() => playCard(g, "p1", 1)).toThrow(/not in progress/i);
  });
});

describe("game end", () => {
  it("after 9 rounds phase is finished", () => {
    let g = createGame("p1");
    for (let card = 8; card >= 0; card--) {
      g = playCard(g, "p1", card);
      g = playCard(g, "p2", card); // equal cards -> draw every round
    }
    expect(g.phase).toBe("finished");
    expect(g.scores).toEqual({ p1: 0, p2: 0 });
    expect(g.history).toHaveLength(9);
    expect(g.history.every((r) => r.winner === "draw")).toBe(true);
    expect(g.hands.p1).toHaveLength(0);
    expect(g.hands.p2).toHaveLength(0);
  });
});

describe("toClientView", () => {
  it("hides opponent numbers, exposes only colors", () => {
    let g = createGame("p1");
    g = playCard(g, "p1", 5); // leader plays; color white visible
    const followerView = toClientView(g, "p2");
    expect(followerView.currentRound.iAmLeader).toBe(false);
    expect(followerView.currentRound.leaderColor).toBe("white"); // 5 is white
    expect(followerView.currentRound.leaderHasPlayed).toBe(true);
    expect(followerView.turn).toBe("me");
    // structural assertion: the round object must not expose leaderCard numerically,
    // and the view must not expose raw opponent played cards
    expect(followerView.currentRound).not.toHaveProperty("leaderCard");
    expect(followerView).not.toHaveProperty("opponentPlayedCards");
  });
  it("maps scores and results to me/opp perspective", () => {
    let g = createGame("p1");
    g = playCard(g, "p1", 8);
    g = playCard(g, "p2", 0); // p1 wins R1
    const v1 = toClientView(g, "p1");
    expect(v1.scores).toEqual({ me: 1, opp: 0 });
    expect(v1.roundResults).toEqual(["win"]);
    expect(v1.myPlayedCards).toEqual([8]);
    expect(v1.opponentPlayedColors).toEqual(["black"]); // 0 is black
    const v2 = toClientView(g, "p2");
    expect(v2.scores).toEqual({ me: 0, opp: 1 });
    expect(v2.roundResults).toEqual(["lose"]);
  });
});

describe("toClientView — opponentRemaining", () => {
  it("fresh game: opponentRemaining is { black: 5, white: 4 } for both players", () => {
    const g = createGame("p1");
    const v1 = toClientView(g, "p1");
    const v2 = toClientView(g, "p2");
    expect(v1.opponentRemaining).toEqual({ black: 5, white: 4 });
    expect(v2.opponentRemaining).toEqual({ black: 5, white: 4 });
  });

  it("counts decrease correctly after opponent plays and black + white === opponentCardsLeft", () => {
    let g = createGame("p1"); // p1 leads
    // R1: p1 plays card 0 (black), p2 plays card 1 (white)
    g = playCard(g, "p1", 0); // p1 plays 0 (black)
    g = playCard(g, "p2", 1); // p2 plays 1 (white); round resolved, p2 wins (1 > 0), p2 leads
    // R2: p2 leads with card 3 (white), p1 plays card 2 (black)
    g = playCard(g, "p2", 3); // p2 plays 3 (white)
    g = playCard(g, "p1", 2); // p1 plays 2 (black); round resolved

    // From p1's perspective: p2 (the opponent) started with {black:5,white:4}
    // p2 has played cards 1 (white) and 3 (white) → 2 white played
    // p2 remaining: {black:5, white:2}, total=7 cards left
    const v1 = toClientView(g, "p1");
    expect(v1.opponentRemaining).toEqual({ black: 5, white: 2 });
    expect(v1.opponentRemaining.black + v1.opponentRemaining.white).toBe(
      v1.opponentCardsLeft,
    );

    // From p2's perspective: p1 (the opponent) started with {black:5,white:4}
    // p1 has played cards 0 (black) and 2 (black) → 2 black played
    // p1 remaining: {black:3, white:4}, total=7 cards left
    const v2 = toClientView(g, "p2");
    expect(v2.opponentRemaining).toEqual({ black: 3, white: 4 });
    expect(v2.opponentRemaining.black + v2.opponentRemaining.white).toBe(
      v2.opponentCardsLeft,
    );
  });

  it("anti-leak structural check: opponentRemaining has exactly keys black and white (both numbers), no raw card numbers or leaderCard", () => {
    let g = createGame("p1");
    g = playCard(g, "p1", 5); // leader plays; gives a mid-round state
    const view = toClientView(g, "p2"); // p2 is follower

    // opponentRemaining exists and has exactly the right shape
    expect(view.opponentRemaining).toBeDefined();
    expect(Object.keys(view.opponentRemaining).sort()).toEqual([
      "black",
      "white",
    ]);
    expect(typeof view.opponentRemaining.black).toBe("number");
    expect(typeof view.opponentRemaining.white).toBe("number");

    // No hidden-info leak
    expect(view.currentRound).not.toHaveProperty("leaderCard");
    expect(view).not.toHaveProperty("opponentPlayedCards");
  });
});

describe("toReview", () => {
  it("reveals both real cards per round from each perspective", () => {
    let g = createGame("p1");
    const moves: Array<[PlayerId, Card]> = [
      ["p1", 8],
      ["p2", 0], // R1 p1 leads, p1 wins
      ["p1", 7],
      ["p2", 1], // R2 p1 wins
      ["p1", 6],
      ["p2", 2], // R3 p1 wins
      ["p1", 5],
      ["p2", 3], // R4 p1 wins
      ["p1", 4],
      ["p2", 4], // R5 draw, leader stays p1
      ["p1", 3],
      ["p2", 5], // R6 p2 wins -> p2 leads
      ["p2", 8],
      ["p1", 0], // R7 p2 leads, p2 wins
      ["p2", 7],
      ["p1", 1], // R8 p2 wins
      ["p2", 6],
      ["p1", 2], // R9 p2 wins
    ];
    for (const [p, c] of moves) g = playCard(g, p, c);

    const r = toReview(g, "p1");
    expect(r.rounds).toHaveLength(9);
    expect(r.rounds[0]).toEqual({
      round: 1,
      firstPlayer: "me",
      myCard: 8,
      oppCard: 0,
      result: "win",
    });
    expect(r.rounds[6]).toEqual({
      round: 7,
      firstPlayer: "opp",
      myCard: 0,
      oppCard: 8,
      result: "lose",
    });
    expect(r.finalScore).toEqual({ me: 4, opp: 4 });
    expect(r.winner).toBe("draw");
  });

  it("winner reflects final score", () => {
    const base = createGame("p1");
    expect(
      toReview({ ...base, phase: "finished", scores: { p1: 5, p2: 4 } }, "p1")
        .winner,
    ).toBe("me");
    expect(
      toReview({ ...base, phase: "finished", scores: { p1: 4, p2: 5 } }, "p1")
        .winner,
    ).toBe("opp");
    expect(
      toReview({ ...base, phase: "finished", scores: { p1: 4, p2: 4 } }, "p1")
        .winner,
    ).toBe("draw");
  });
});
