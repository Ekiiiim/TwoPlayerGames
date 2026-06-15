export type Card = number; // 0..8
export type Color = 'black' | 'white';
export type RoundResult = 'win' | 'lose' | 'draw';
export type Phase = 'waiting' | 'playing' | 'finished';
export type PlayerId = 'p1' | 'p2';

export interface RoundRecord {
  round: number;            // 1..9
  leader: PlayerId;
  cards: Record<PlayerId, Card>;
  winner: PlayerId | 'draw';
}

export interface GameState {
  hands: Record<PlayerId, Card[]>;
  scores: Record<PlayerId, number>;
  current: {
    index: number;          // 1..9
    leader: PlayerId;
    leaderCard?: Card;
    followerCard?: Card;
  };
  history: RoundRecord[];
  phase: Phase;
}

export interface ClientView {
  myHand: Card[];
  myPlayedCards: Card[];
  opponentCardsLeft: number;
  opponentPlayedColors: Color[];
  roundResults: RoundResult[];
  scores: { me: number; opp: number };
  currentRound: {
    index: number;
    iAmLeader: boolean;
    leaderColor?: Color;
    leaderHasPlayed: boolean;
    followerHasPlayed: boolean;
  };
  turn: 'me' | 'opp';
  phase: Phase;
}

export interface GameReviewRound {
  round: number;
  firstPlayer: 'me' | 'opp';
  myCard: Card;
  oppCard: Card;
  result: RoundResult;
}

export interface GameReview {
  rounds: GameReviewRound[];
  finalScore: { me: number; opp: number };
  winner: 'me' | 'opp' | 'draw';
}
