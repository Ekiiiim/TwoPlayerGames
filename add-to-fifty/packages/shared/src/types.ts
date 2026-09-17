import type { ErrorCode, ErrorMsg, PlayerId } from "@tpg/protocol";

// 会话层类型统一由 @tpg/protocol 定义。这里 re-export,让游戏代码里现有的
// `from "@add-to-fifty/shared"` 继续有效。PlayerId 在本文件内部还被大量引用,
// 所以 import 和 export 分两句写 —— `export type { X } from "..."` 不产生
// 本地绑定。
export type { ErrorCode, ErrorMsg, PlayerId };

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
