export type PlayerId = "p1" | "p2";

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export type Phase = "waiting" | "playing" | "finished";

export interface PlayedCard {
  player: PlayerId;
  card: Card;
  delta: number;
  total: number;
}

export interface GameState {
  deck: Card[];
  hands: Record<PlayerId, Card[]>;
  discardTotal: number;
  turn: PlayerId;
  history: PlayedCard[];
  phase: Phase;
  loser?: PlayerId;
}

export interface ClientView {
  myHand: Card[];
  opponentCardsLeft: number;
  deckCount: number;
  discardTotal: number;
  turn: "me" | "opp";
  history: PlayedCard[];
  topDiscard: PlayedCard | null;
  phase: Phase;
  winner: "me" | "opp" | null;
  loser: "me" | "opp" | null;
}

// Wire-level error identifiers. The server never sends display text: it names
// what went wrong and the client renders it in the player's current language.
export type ErrorCode =
  | "ALREADY_IN_ROOM"
  | "INVALID_REQUEST"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "INVALID_SESSION"
  | "INVALID_MOVE"
  | "OPPONENT_GONE";

export interface ErrorMsg {
  code: ErrorCode;
}
