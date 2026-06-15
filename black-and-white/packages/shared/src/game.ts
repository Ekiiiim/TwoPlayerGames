import type { Card, Color, GameState, PlayerId } from './types';

export function colorOf(card: Card): Color {
  return card % 2 === 0 ? 'black' : 'white';
}

function fullHand(): Card[] {
  return [0, 1, 2, 3, 4, 5, 6, 7, 8];
}

export function createGame(firstLeader: PlayerId): GameState {
  return {
    hands: { p1: fullHand(), p2: fullHand() },
    scores: { p1: 0, p2: 0 },
    current: { index: 1, leader: firstLeader },
    history: [],
    phase: 'playing',
  };
}
