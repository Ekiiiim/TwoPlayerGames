import { describe, it, expect } from 'vitest';
import { colorOf } from '../src/game';

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
