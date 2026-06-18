import { describe, it, expect } from 'vitest';
import { createBoard } from '../src/game';
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
