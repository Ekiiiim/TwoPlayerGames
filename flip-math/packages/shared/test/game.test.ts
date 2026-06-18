import { describe, it, expect } from 'vitest';
import {
  createBoard,
  evalExpr,
  isPositiveInt,
  solvableTargets,
  generateTarget,
} from '../src/game';
import type { CellBack, Operator } from '../src/types';

function backKey(b: CellBack): string {
  return b.kind === 'num' ? `n${b.value}` : `o${b.op}`;
}

describe('createBoard', () => {
  it('produces 16 cells with letters A..P in reading order', () => {
    const board = createBoard();
    expect(board).toHaveLength(16);
    const letters = board.map((c) => c.letter).join('');
    expect(letters).toBe('ABCDEFGHIJKLMNOP');
    board.forEach((c, i) => expect(c.index).toBe(i));
  });

  it('contains exactly 1..12 once and each operator once (no repeats)', () => {
    const board = createBoard();
    const keys = board.map((c) => backKey(c.back)).sort();
    const expected = [
      ...Array.from({ length: 12 }, (_, i) => `n${i + 1}`),
      ...(['+', '-', '*', '/'] as Operator[]).map((o) => `o${o}`),
    ].sort();
    expect(keys).toEqual(expected);
  });

  it('shuffles using the injected rng (deterministic)', () => {
    // rng 返回 0 → Fisher-Yates 每步 j=0,得到确定排列
    const board = createBoard(() => 0);
    const board2 = createBoard(() => 0);
    expect(board.map((c) => backKey(c.back))).toEqual(board2.map((c) => backKey(c.back)));
  });
});

describe('evalExpr', () => {
  it('computes the four operators', () => {
    expect(evalExpr(3, '+', 4)).toBe(7);
    expect(evalExpr(9, '-', 4)).toBe(5);
    expect(evalExpr(3, '*', 4)).toBe(12);
    expect(evalExpr(12, '/', 4)).toBe(3);
  });
  it('returns null for non-integer or zero division', () => {
    expect(evalExpr(7, '/', 2)).toBeNull();
    expect(evalExpr(5, '/', 0)).toBeNull();
  });
  it('returns negative for a<b subtraction (caller filters)', () => {
    expect(evalExpr(3, '-', 8)).toBe(-5);
    expect(isPositiveInt(evalExpr(3, '-', 8))).toBe(false);
  });
});

describe('solvableTargets / generateTarget', () => {
  it('every generated target is positive and actually solvable on the board', () => {
    for (let i = 0; i < 200; i++) {
      const board = createBoard();
      const targets = solvableTargets(board);
      expect(targets.length).toBeGreaterThan(0);
      const t = generateTarget(board);
      expect(t).toBeGreaterThan(0);
      expect(Number.isInteger(t)).toBe(true);
      expect(targets).toContain(t);
    }
  });
});
