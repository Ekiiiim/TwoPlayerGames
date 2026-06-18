import type {
  Action,
  Cell,
  CellBack,
  ClientView,
  Durations,
  EngineCtx,
  GameState,
  Operator,
  Phase,
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

// 合法算式:cells = [c1, c2, c3];c1/c3 为数字格、c2 为运算符格、三张互异,
// 且 c1 op c3 === target 且为正整数。
export function validateAnswer(board: Cell[], cells: number[], target: number): boolean {
  if (cells.length !== 3) return false;
  if (new Set(cells).size !== 3) return false;
  if (cells.some((c) => c < 0 || c >= board.length)) return false;
  const [a, op, b] = cells.map((c) => board[c].back);
  if (a.kind !== 'num' || b.kind !== 'num' || op.kind !== 'op') return false;
  const r = evalExpr(a.value, op.op, b.value);
  return isPositiveInt(r) && r === target;
}

export const WIN_SCORE = 10;
export const DURATIONS: Durations = {
  previewMs: 10_000,
  answerMs: 5_000,
  revealMs: 3_000,
  resolveMs: 1_500,
};

export function createGame(ctx: EngineCtx): GameState {
  return {
    board: createBoard(),
    scores: { p1: 0, p2: 0 },
    phase: 'preview',
    target: null,
    active: null,
    selection: [],
    revealIndex: 0,
    revealedCells: [],
    lastResolve: null,
    deadline: ctx.now + ctx.durations.previewMs,
    winner: null,
  };
}

function requirePhase(s: GameState, p: Phase): void {
  if (s.phase !== p) throw new Error(`Expected phase ${p}, got ${s.phase}`);
}

export function reduce(state: GameState, action: Action, ctx: EngineCtx): GameState {
  switch (action.type) {
    case 'PREVIEW_DONE': {
      requirePhase(state, 'preview');
      return {
        ...state,
        phase: 'buzzing',
        target: generateTarget(state.board),
        active: null,
        selection: [],
        revealedCells: [],
        deadline: null,
      };
    }
    default:
      throw new Error(`Unhandled action ${(action as Action).type}`);
  }
}
