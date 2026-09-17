import type { ErrorCode, ErrorMsg, PlayerId } from "@tpg/protocol";

// 会话层类型统一由 @tpg/protocol 定义。这里 re-export,让游戏代码里现有的
// `from "@texas-poker/shared"` 继续有效。PlayerId 在本文件内部还被大量引用,
// 所以 import 和 export 分两句写 —— `export type { X } from "..."` 不产生
// 本地绑定。
export type { ErrorCode, ErrorMsg, PlayerId };

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank =
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
  | "K"
  | "A";

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";
export type Phase = "waiting" | "betting" | "finished";
export type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "all-in";
export type HandCategory =
  | "high-card"
  | "pair"
  | "two-pair"
  | "three-kind"
  | "straight"
  | "flush"
  | "full-house"
  | "four-kind"
  | "straight-flush";

export interface PlayerState {
  chips: number;
  committed: number;
  streetBet: number;
  holeCards: Card[];
  folded: boolean;
  allIn: boolean;
}

export interface HandValue {
  category: HandCategory;
  ranks: number[];
  cardIds: string[];
}

export interface ShowdownResult {
  winners: PlayerId[];
  hands: Record<PlayerId, HandValue>;
}

export interface GameConfig {
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
  enforceMinRaise: boolean;
}

export interface GameState {
  deck: Card[];
  startingChips: number;
  dealer: PlayerId;
  street: Street;
  phase: Phase;
  players: Record<PlayerId, PlayerState>;
  communityCards: Card[];
  pot: number;
  currentBet: number;
  minRaise: number;
  baseRaiseIncrement: number;
  enforceMinRaise: boolean;
  actionOn: PlayerId;
  acted: PlayerId[];
  lastAggressor: PlayerId | null;
  handNumber: number;
  winner: PlayerId | "split" | null;
  winReason: "fold" | "showdown" | null;
  showdown: ShowdownResult | null;
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  minRaiseTo: number | null;
  maxRaiseTo: number | null;
  canBet: boolean;
  minBet: number | null;
  maxBet: number | null;
  canAllIn: boolean;
}

export interface ClientView {
  myId: PlayerId;
  myHoleCards: Card[];
  opponentHoleCount: number;
  opponentHoleCards: Card[] | null;
  communityCards: Card[];
  pot: number;
  street: Street;
  phase: Phase;
  dealer: "me" | "opp";
  actionOn: "me" | "opp";
  players: {
    me: Omit<PlayerState, "holeCards">;
    opp: Omit<PlayerState, "holeCards">;
  };
  legalActions: LegalActions;
  settings: {
    enforceMinRaise: boolean;
    startingChips: number;
  };
  winner: "me" | "opp" | "split" | null;
  winReason: GameState["winReason"];
  showdown: ShowdownResult | null;
  matchOver: boolean;
  matchWinner: "me" | "opp" | null;
  canStartNextHand: boolean;
}

// Wire-level error identifiers. The server never sends display text: it names
// what went wrong and the client renders it in the player's current language.
