import { describe, it, expect } from 'vitest';
import { colorOf, createGame } from '../src/game';

describe('colorOf', () => {
  it('even cards are black', () => {
    expect(colorOf(0)).toBe('black');
    expect(colorOf(8)).toBe('black');
  });
  it('odd cards are white', () => {
    expect(colorOf(1)).toBe('white');
    expect(colorOf(7)).toBe('white');
  });
});

describe('createGame', () => {
  it('deals 0..8 to both players', () => {
    const g = createGame('p1');
    expect([...g.hands.p1].sort((a, b) => a - b)).toEqual([0,1,2,3,4,5,6,7,8]);
    expect([...g.hands.p2].sort((a, b) => a - b)).toEqual([0,1,2,3,4,5,6,7,8]);
  });
  it('starts at round 1, playing phase, given leader, zero scores', () => {
    const g = createGame('p2');
    expect(g.current.index).toBe(1);
    expect(g.current.leader).toBe('p2');
    expect(g.phase).toBe('playing');
    expect(g.scores).toEqual({ p1: 0, p2: 0 });
    expect(g.history).toEqual([]);
  });
});
