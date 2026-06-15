import { describe, it, expect } from 'vitest';
import { colorOf, createGame, playCard, otherPlayer } from '../src/game';

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

describe('playCard happy path', () => {
  it('leader plays, then follower; higher card wins the round', () => {
    let g = createGame('p1');           // p1 leads
    g = playCard(g, 'p1', 5);           // leader
    expect(g.current.leaderCard).toBe(5);
    expect(g.hands.p1).not.toContain(5);
    g = playCard(g, 'p2', 3);           // follower (p2)
    // round resolved: p1 wins
    expect(g.scores).toEqual({ p1: 1, p2: 0 });
    expect(g.history).toHaveLength(1);
    expect(g.history[0]).toEqual({
      round: 1, leader: 'p1', cards: { p1: 5, p2: 3 }, winner: 'p1',
    });
  });
  it('winner leads the next round', () => {
    let g = createGame('p1');
    g = playCard(g, 'p1', 2);
    g = playCard(g, 'p2', 6);           // p2 wins
    expect(g.current.index).toBe(2);
    expect(g.current.leader).toBe('p2');
    expect(g.current.leaderCard).toBeUndefined();
  });
  it('otherPlayer flips id', () => {
    expect(otherPlayer('p1')).toBe('p2');
    expect(otherPlayer('p2')).toBe('p1');
  });
});

describe('playCard draw', () => {
  it('equal cards: no score, leader unchanged next round', () => {
    let g = createGame('p1');
    g = playCard(g, 'p1', 4);
    g = playCard(g, 'p2', 4);           // draw
    expect(g.scores).toEqual({ p1: 0, p2: 0 });
    expect(g.history[0].winner).toBe('draw');
    expect(g.current.index).toBe(2);
    expect(g.current.leader).toBe('p1'); // unchanged
  });
});

describe('playCard validation', () => {
  it('rejects when it is not the player turn', () => {
    const g = createGame('p1');         // p1 leads
    expect(() => playCard(g, 'p2', 3)).toThrow(/not your turn/i);
  });
  it('rejects a card not in hand', () => {
    let g = createGame('p1');
    g = playCard(g, 'p1', 5);
    expect(() => playCard(g, 'p1', 5)).toThrow(); // p1 already played / not turn
  });
  it('rejects follower playing a card they do not hold', () => {
    let g = createGame('p1');
    g = playCard(g, 'p1', 5);
    // p2 still holds 0..8; playing 99 is invalid
    expect(() => playCard(g, 'p2', 99)).toThrow(/not in hand/i);
  });
  it('rejects play when game finished', () => {
    const g = { ...createGame('p1'), phase: 'finished' as const };
    expect(() => playCard(g, 'p1', 1)).toThrow(/not in progress/i);
  });
});
