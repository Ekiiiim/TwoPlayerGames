import type { Card, Color } from './types';

export function colorOf(card: Card): Color {
  return card % 2 === 0 ? 'black' : 'white';
}
