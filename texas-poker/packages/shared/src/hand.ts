import type { Card, HandCategory, HandValue } from "./types";

const CATEGORY_SCORE: Record<HandCategory, number> = {
  "high-card": 0,
  pair: 1,
  "two-pair": 2,
  "three-kind": 3,
  straight: 4,
  flush: 5,
  "full-house": 6,
  "four-kind": 7,
  "straight-flush": 8,
};

const RANK_VALUE: Record<Card["rank"], number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export function rankValue(card: Card): number {
  return RANK_VALUE[card.rank];
}

export function compareHandValues(a: HandValue, b: HandValue): number {
  const categoryDiff = CATEGORY_SCORE[a.category] - CATEGORY_SCORE[b.category];
  if (categoryDiff !== 0) return categoryDiff;
  const len = Math.max(a.ranks.length, b.ranks.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (a.ranks[i] ?? 0) - (b.ranks[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function straightHigh(values: number[]): number | null {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);
  for (let i = 0; i <= unique.length - 5; i += 1) {
    const slice = unique.slice(i, i + 5);
    if (slice[0] - slice[4] === 4) return slice[0];
  }
  return null;
}

function byCountThenRank(entries: [number, number][]): [number, number][] {
  return entries.sort(([rankA, countA], [rankB, countB]) => {
    if (countA !== countB) return countB - countA;
    return rankB - rankA;
  });
}

function evaluateFive(cards: Card[]): HandValue {
  const values = cards.map(rankValue).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const card of cards) {
    counts.set(rankValue(card), (counts.get(rankValue(card)) ?? 0) + 1);
  }

  const cardIds = cards.map((card) => card.id);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const straight = straightHigh(values);
  if (flush && straight !== null) {
    return { category: "straight-flush", ranks: [straight], cardIds };
  }

  const grouped = byCountThenRank([...counts.entries()]);
  const four = grouped.find(([, count]) => count === 4);
  if (four) {
    const kicker = values.find((value) => value !== four[0])!;
    return { category: "four-kind", ranks: [four[0], kicker], cardIds };
  }

  const trips = grouped.filter(([, count]) => count === 3);
  const pairs = grouped.filter(([, count]) => count === 2);
  if (trips.length > 0 && (pairs.length > 0 || trips.length > 1)) {
    const trip = trips[0][0];
    const pair = trips.length > 1 ? trips[1][0] : pairs[0][0];
    return { category: "full-house", ranks: [trip, pair], cardIds };
  }

  if (flush) {
    return {
      category: "flush",
      ranks: values,
      cardIds,
    };
  }

  if (straight !== null) return { category: "straight", ranks: [straight], cardIds };

  if (trips.length > 0) {
    const trip = trips[0][0];
    const kickers = values.filter((value) => value !== trip).slice(0, 2);
    return { category: "three-kind", ranks: [trip, ...kickers], cardIds };
  }

  if (pairs.length >= 2) {
    const topPairs = pairs.slice(0, 2).map(([rank]) => rank);
    const kicker = values.find((value) => !topPairs.includes(value))!;
    return { category: "two-pair", ranks: [...topPairs, kicker], cardIds };
  }

  if (pairs.length === 1) {
    const pair = pairs[0][0];
    const kickers = values.filter((value) => value !== pair).slice(0, 3);
    return { category: "pair", ranks: [pair, ...kickers], cardIds };
  }

  return { category: "high-card", ranks: values, cardIds };
}

export function evaluateSeven(cards: Card[]): HandValue {
  if (cards.length !== 7)
    throw new Error("Texas Hold'em evaluation needs 7 cards");

  let best: HandValue | null = null;
  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            const candidate = evaluateFive([
              cards[a],
              cards[b],
              cards[c],
              cards[d],
              cards[e],
            ]);
            if (!best || compareHandValues(candidate, best) > 0) {
              best = candidate;
            }
          }
        }
      }
    }
  }

  return best!;
}
