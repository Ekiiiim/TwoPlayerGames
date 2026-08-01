import { describe, expect, it } from "vitest";
import { compareHandValues, evaluateSeven } from "../src/hand";
import type { Card } from "../src/types";

function c(rank: Card["rank"], suit: Card["suit"]): Card {
  return { id: `${rank}-${suit}`, rank, suit };
}

describe("texas poker hand evaluator", () => {
  it("ranks straight flush above four of a kind", () => {
    const sf = evaluateSeven([
      c("9", "hearts"),
      c("10", "hearts"),
      c("J", "hearts"),
      c("Q", "hearts"),
      c("K", "hearts"),
      c("2", "clubs"),
      c("3", "diamonds"),
    ]);
    const quads = evaluateSeven([
      c("A", "hearts"),
      c("A", "clubs"),
      c("A", "diamonds"),
      c("A", "spades"),
      c("K", "clubs"),
      c("2", "clubs"),
      c("3", "diamonds"),
    ]);

    expect(sf.category).toBe("straight-flush");
    expect(quads.category).toBe("four-kind");
    expect(compareHandValues(sf, quads)).toBeGreaterThan(0);
  });

  it("handles ace-low straights", () => {
    const value = evaluateSeven([
      c("A", "spades"),
      c("2", "clubs"),
      c("3", "diamonds"),
      c("4", "hearts"),
      c("5", "spades"),
      c("K", "clubs"),
      c("9", "diamonds"),
    ]);

    expect(value.category).toBe("straight");
    expect(value.ranks).toEqual([5]);
    expect(value.cardIds).toEqual([
      "A-spades",
      "2-clubs",
      "3-diamonds",
      "4-hearts",
      "5-spades",
    ]);
  });

  it("returns the exact five cards that make the best hand", () => {
    const value = evaluateSeven([
      c("A", "spades"),
      c("A", "clubs"),
      c("A", "diamonds"),
      c("K", "hearts"),
      c("K", "spades"),
      c("2", "clubs"),
      c("9", "diamonds"),
    ]);

    expect(value.category).toBe("full-house");
    expect(value.ranks).toEqual([14, 13]);
    expect(new Set(value.cardIds)).toEqual(
      new Set([
        "A-spades",
        "A-clubs",
        "A-diamonds",
        "K-hearts",
        "K-spades",
      ]),
    );
  });

  it("breaks ties by kickers", () => {
    const acePairKing = evaluateSeven([
      c("A", "spades"),
      c("A", "clubs"),
      c("K", "diamonds"),
      c("9", "hearts"),
      c("7", "spades"),
      c("3", "clubs"),
      c("2", "diamonds"),
    ]);
    const acePairQueen = evaluateSeven([
      c("A", "diamonds"),
      c("A", "hearts"),
      c("Q", "diamonds"),
      c("9", "clubs"),
      c("7", "clubs"),
      c("3", "spades"),
      c("2", "clubs"),
    ]);

    expect(compareHandValues(acePairKing, acePairQueen)).toBeGreaterThan(0);
  });
});
