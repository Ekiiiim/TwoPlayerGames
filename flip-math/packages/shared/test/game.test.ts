import { describe, it, expect } from 'vitest';
import {
  createBoard, evalExpr, isPositiveInt, solvableTargets, generateTarget,
  validateAnswer, createGame, reduce, DURATIONS, WIN_SCORE,
} from '../src/game';
import type { EngineCtx } from '../src/types';

const ctx: EngineCtx = { now: 1_000_000, durations: DURATIONS };
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

import type { Cell } from '../src/types';

// 固定一块用于断言的牌面(index→back),letter 不影响判定。
function fixedBoard(): Cell[] {
  const backs = [
    { kind: 'num', value: 3 }, // 0
    { kind: 'op', op: '+' },   // 1
    { kind: 'num', value: 4 }, // 2
    { kind: 'num', value: 8 }, // 3
    { kind: 'op', op: '-' },   // 4
    { kind: 'op', op: '*' },   // 5
    { kind: 'num', value: 2 }, // 6
    { kind: 'op', op: '/' },   // 7
  ] as const;
  return backs.map((back, i) => ({ index: i, letter: String.fromCharCode(65 + i), back: { ...back } }));
}

describe('validateAnswer', () => {
  const board = fixedBoard();
  it('accepts num-op-num equal to target', () => {
    expect(validateAnswer(board, [0, 1, 2], 7)).toBe(true);  // 3 + 4
    expect(validateAnswer(board, [3, 4, 2], 4)).toBe(true);  // 8 - 4
    expect(validateAnswer(board, [3, 7, 2], 2)).toBe(true);  // 8 / 4
  });
  it('rejects wrong result', () => {
    expect(validateAnswer(board, [0, 1, 2], 99)).toBe(false);
  });
  it('rejects wrong cell types / order (op not in middle)', () => {
    expect(validateAnswer(board, [1, 0, 2], 7)).toBe(false); // op,num,num
    expect(validateAnswer(board, [0, 2, 1], 7)).toBe(false); // num,num,op
  });
  it('rejects non-distinct or wrong-length selections', () => {
    expect(validateAnswer(board, [0, 1, 0], 6)).toBe(false);
    expect(validateAnswer(board, [0, 1], 7)).toBe(false);
  });
  it('rejects non-integer division and non-positive results', () => {
    expect(validateAnswer(board, [0, 7, 2], 0)).toBe(false); // 3/4 非整数
    expect(validateAnswer(board, [2, 4, 3], -4)).toBe(false); // 4-8 为负
  });
});

describe('createGame', () => {
  it('starts in preview with a full board and preview deadline', () => {
    const g = createGame(ctx);
    expect(g.phase).toBe('preview');
    expect(g.board).toHaveLength(16);
    expect(g.scores).toEqual({ p1: 0, p2: 0 });
    expect(g.target).toBeNull();
    expect(g.active).toBeNull();
    expect(g.selection).toEqual([]);
    expect(g.revealIndex).toBe(0);
    expect(g.deadline).toBe(ctx.now + DURATIONS.previewMs);
    expect(g.winner).toBeNull();
  });
});

describe('reduce: PREVIEW_DONE', () => {
  it('moves preview -> buzzing with a solvable target and no deadline', () => {
    const g = createGame(ctx);
    const g2 = reduce(g, { type: 'PREVIEW_DONE' }, ctx);
    expect(g2.phase).toBe('buzzing');
    expect(g2.target).not.toBeNull();
    expect(solvableTargets(g2.board)).toContain(g2.target);
    expect(g2.deadline).toBeNull(); // 抢答无超时
  });
  it('throws if called in the wrong phase', () => {
    const g = createGame(ctx);
    const buzzing = reduce(g, { type: 'PREVIEW_DONE' }, ctx);
    expect(() => reduce(buzzing, { type: 'PREVIEW_DONE' }, ctx)).toThrow();
  });
});

// 辅助:把游戏推进到 buzzing 状态
function toBuzzing() {
  return reduce(createGame(ctx), { type: 'PREVIEW_DONE' }, ctx);
}

describe('reduce: BUZZ', () => {
  it('buzzing -> answering, sets active and answer deadline', () => {
    const g = reduce(toBuzzing(), { type: 'BUZZ', player: 'p2' }, ctx);
    expect(g.phase).toBe('answering');
    expect(g.active).toBe('p2');
    expect(g.selection).toEqual([]);
    expect(g.deadline).toBe(ctx.now + DURATIONS.answerMs);
  });
  it('throws if buzz outside buzzing phase', () => {
    expect(() => reduce(createGame(ctx), { type: 'BUZZ', player: 'p1' }, ctx)).toThrow();
  });
});

describe('reduce: SELECT toggle (before 3)', () => {
  it('adds an unselected cell, removes an already-selected one', () => {
    let g = reduce(toBuzzing(), { type: 'BUZZ', player: 'p1' }, ctx);
    g = reduce(g, { type: 'SELECT', player: 'p1', cell: 5 }, ctx);
    expect(g.selection).toEqual([5]);
    g = reduce(g, { type: 'SELECT', player: 'p1', cell: 2 }, ctx);
    expect(g.selection).toEqual([5, 2]);
    g = reduce(g, { type: 'SELECT', player: 'p1', cell: 5 }, ctx); // 撤销 5
    expect(g.selection).toEqual([2]);
    expect(g.phase).toBe('answering'); // 不足 3 张,仍在作答
  });
  it('rejects select from the non-active player', () => {
    const g = reduce(toBuzzing(), { type: 'BUZZ', player: 'p1' }, ctx);
    expect(() => reduce(g, { type: 'SELECT', player: 'p2', cell: 0 }, ctx)).toThrow();
  });
});
