import type {
  Card,
  ClientView,
  GameState,
  PlayerId,
  Rank,
  Suit,
} from "./types";

export const PLAYER_IDS: readonly PlayerId[] = ["p1", "p2"];
export const TARGET_TOTAL = 50;
export const HAND_SIZE = 5;

const SUITS: readonly Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS: readonly Rank[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({ id: `${rank}-${suit}`, rank, suit })),
  );
}

export function shuffleDeck(
  deck: readonly Card[],
  rng: () => number = Math.random,
): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function otherPlayer(player: PlayerId): PlayerId {
  return player === "p1" ? "p2" : "p1";
}

export function rankDelta(card: Card, kingDelta?: number): number {
  if (card.rank === "K") {
    if (kingDelta === undefined) {
      throw new Error("K requires a chosen delta");
    }
    if (!Number.isInteger(kingDelta)) {
      throw new Error("K delta must be an integer");
    }
    if (kingDelta < -10 || kingDelta > 10) {
      throw new Error("K delta must be between -10 and 10");
    }
    return kingDelta;
  }

  if (kingDelta !== undefined) {
    throw new Error("Only K can choose a delta");
  }

  if (card.rank === "A") return 1;
  if (card.rank === "J") return -10;
  if (card.rank === "Q") return 0;
  return Number(card.rank);
}

export function createGame(
  firstPlayer: PlayerId,
  deck: readonly Card[],
): GameState {
  if (deck.length < HAND_SIZE * 2) {
    throw new Error("Deck does not contain enough cards");
  }

  return {
    deck: deck.slice(HAND_SIZE * 2),
    hands: {
      p1: deck.slice(0, HAND_SIZE),
      p2: deck.slice(HAND_SIZE, HAND_SIZE * 2),
    },
    discardTotal: 0,
    turn: firstPlayer,
    history: [],
    phase: "playing",
  };
}

export function playCard(
  game: GameState,
  player: PlayerId,
  cardId: string,
  kingDelta?: number,
): GameState {
  if (game.phase !== "playing") {
    throw new Error("Game is not in progress");
  }
  if (game.turn !== player) {
    throw new Error("It is not your turn");
  }

  const hand = game.hands[player];
  const cardIndex = hand.findIndex((card) => card.id === cardId);
  if (cardIndex === -1) {
    throw new Error("Card is not in hand");
  }

  const card = hand[cardIndex];
  const delta = rankDelta(card, kingDelta);
  const discardTotal = game.discardTotal + delta;
  const nextDeck = [...game.deck];
  const nextHand = hand.filter((_, index) => index !== cardIndex);
  const drawn = nextDeck.shift();
  if (drawn) nextHand.push(drawn);

  const hands = {
    ...game.hands,
    [player]: nextHand,
  };
  const history = [
    ...game.history,
    { player, card, delta, total: discardTotal },
  ];

  if (discardTotal >= TARGET_TOTAL) {
    return {
      ...game,
      hands,
      deck: nextDeck,
      discardTotal,
      history,
      phase: "finished",
      loser: player,
    };
  }

  return {
    ...game,
    hands,
    deck: nextDeck,
    discardTotal,
    history,
    turn: otherPlayer(player),
  };
}

export function toClientView(game: GameState, me: PlayerId): ClientView {
  const opp = otherPlayer(me);
  const loser =
    game.loser === undefined ? null : game.loser === me ? "me" : "opp";
  const winner =
    game.loser === undefined ? null : game.loser === me ? "opp" : "me";
  const history = game.history.map((entry) => ({ ...entry }));

  return {
    myHand: [...game.hands[me]],
    opponentCardsLeft: game.hands[opp].length,
    deckCount: game.deck.length,
    discardTotal: game.discardTotal,
    turn: game.turn === me ? "me" : "opp",
    history,
    topDiscard: history.at(-1) ?? null,
    phase: game.phase,
    winner,
    loser,
  };
}
