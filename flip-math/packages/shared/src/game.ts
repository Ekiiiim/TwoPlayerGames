import type {
  Cell,
  CellBack,
  Operator,
  PlayerId,
} from './types';

export const PLAYER_IDS: readonly PlayerId[] = ['p1', 'p2'];
export function otherPlayer(p: PlayerId): PlayerId {
  return p === 'p1' ? 'p2' : 'p1';
}

const LETTERS = 'ABCDEFGHIJKLMNOP';
const OPERATORS: readonly Operator[] = ['+', '-', '*', '/'];

// 固定多重集合 {1..12, + - * /} 打乱后铺到 16 格,letter 按阅读顺序 A..P。
export function createBoard(rng: () => number = Math.random): Cell[] {
  const backs: CellBack[] = [];
  for (let v = 1; v <= 12; v++) backs.push({ kind: 'num', value: v });
  for (const op of OPERATORS) backs.push({ kind: 'op', op });
  for (let i = backs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [backs[i], backs[j]] = [backs[j], backs[i]];
  }
  return backs.map((back, i) => ({ index: i, letter: LETTERS[i], back }));
}

export function evalExpr(a: number, op: Operator, b: number): number | null {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return b !== 0 && a % b === 0 ? a / b : null;
  }
}

export function isPositiveInt(n: number | null): n is number {
  return n !== null && Number.isInteger(n) && n > 0;
}

// 枚举牌面上所有 (数字格 op 数字格) 的正整数结果(去重)。
export function solvableTargets(board: Cell[]): number[] {
  const nums = board.filter((c) => c.back.kind === 'num');
  const ops = board.filter((c) => c.back.kind === 'op');
  const set = new Set<number>();
  for (const x of nums) {
    for (const y of nums) {
      if (x.index === y.index) continue;
      for (const o of ops) {
        const a = (x.back as { value: number }).value;
        const b = (y.back as { value: number }).value;
        const op = (o.back as { op: Operator }).op;
        const r = evalExpr(a, op, b);
        if (isPositiveInt(r)) set.add(r);
      }
    }
  }
  return [...set];
}

export function generateTarget(board: Cell[], rng: () => number = Math.random): number {
  const targets = solvableTargets(board);
  return targets[Math.floor(rng() * targets.length)];
}
