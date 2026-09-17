import type { ErrorCode, ErrorMsg, PlayerId } from "@tpg/protocol";

// 会话层类型统一由 @tpg/protocol 定义。这里 re-export,让游戏代码里现有的
// `from "@bw/shared"` 继续有效。PlayerId 在本文件内部还被大量引用,
// 所以 import 和 export 分两句写 —— `export type { X } from "..."` 不产生
// 本地绑定。
export type { ErrorCode, ErrorMsg, PlayerId };

export type Card = number; // 0..8
export type Color = "black" | "white";
export type RoundResult = "win" | "lose" | "draw";
export type Phase = "waiting" | "playing" | "finished";
export interface RoundRecord {
  round: number; // 1..9
  leader: PlayerId;
  cards: Record<PlayerId, Card>;
  winner: PlayerId | "draw";
}

export interface GameState {
  hands: Record<PlayerId, Card[]>;
  scores: Record<PlayerId, number>;
  current: {
    index: number; // 1..9
    leader: PlayerId;
    leaderCard?: Card;
  };
  history: RoundRecord[];
  phase: Phase;
}

export interface ClientView {
  myHand: Card[];
  myPlayedCards: Card[];
  opponentCardsLeft: number;
  opponentPlayedColors: Color[];
  opponentRemaining: { black: number; white: number };
  roundResults: RoundResult[];
  scores: { me: number; opp: number };
  currentRound: {
    index: number;
    iAmLeader: boolean;
    leaderColor?: Color;
    leaderHasPlayed: boolean;
  };
  turn: "me" | "opp";
  phase: Phase;
}

export interface GameReviewRound {
  round: number;
  firstPlayer: "me" | "opp";
  myCard: Card;
  oppCard: Card;
  result: RoundResult;
}

export interface GameReview {
  rounds: GameReviewRound[];
  finalScore: { me: number; opp: number };
  winner: "me" | "opp" | "draw";
}

// Wire-level error identifiers. The server never sends display text: it names
// what went wrong and the client renders it in the player's current language.
