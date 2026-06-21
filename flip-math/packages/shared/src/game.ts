import type {
  Action,
  Cell,
  CellBack,
  ClientView,
  EngineCtx,
  GameState,
  Operator,
  Phase,
  PlayerId,
} from './types';
import { WIN_SCORE } from './config'; // 内部 reduce 用;DURATIONS 见下方 re-export

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

// DURATIONS / WIN_SCORE 集中定义在 config.ts;这里对外转发,保持 @fm/shared 的导出不变。
export { DURATIONS, WIN_SCORE } from './config';

// 开局从"准备门"开始(无 deadline,等双方各点一次准备);rematch 复用同一函数。
export function createGame(_ctx: EngineCtx): GameState {
  return {
    board: createBoard(),
    scores: { p1: 0, p2: 0 },
    phase: 'ready',
    readyNext: 'preview',
    ready: { p1: false, p2: false },
    target: null,
    active: null,
    selection: [],
    revealIndex: 0,
    revealedCells: [],
    lastResolve: null,
    deadline: null,
    winner: null,
  };
}

function requirePhase(s: GameState, p: Phase): void {
  if (s.phase !== p) throw new Error(`Expected phase ${p}, got ${s.phase}`);
}

export function reduce(state: GameState, action: Action, ctx: EngineCtx): GameState {
  switch (action.type) {
    case 'READY': {
      requirePhase(state, 'ready');
      const ready = { ...state.ready, [action.player]: true };
      // 未齐 → 仍在准备门(幂等:重复点同一玩家无副作用)。
      if (!(ready.p1 && ready.p2)) return { ...state, ready };
      // 双方齐 → 进入 readyNext。
      if (state.readyNext === 'preview') {
        return { ...state, ready, phase: 'preview', deadline: ctx.now + ctx.durations.previewMs };
      }
      return {
        ...state,
        ready,
        phase: 'reveal',
        revealedCells: [state.revealIndex],
        deadline: ctx.now + ctx.durations.revealMs,
      };
    }
    case 'PREVIEW_DONE': {
      requirePhase(state, 'preview');
      return {
        ...state,
        phase: 'countdown',
        target: null,
        active: null,
        selection: [],
        revealedCells: [],
        deadline: ctx.now + ctx.durations.countdownMs,
      };
    }
    case 'COUNTDOWN_DONE': {
      requirePhase(state, 'countdown');
      // 倒数结束才生成并展示目标 + 开抢。
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
    case 'BUZZ': {
      requirePhase(state, 'buzzing');
      return {
        ...state,
        phase: 'answering',
        active: action.player,
        selection: [],
        deadline: ctx.now + ctx.durations.answerMs,
      };
    }
    case 'SELECT': {
      requirePhase(state, 'answering');
      if (action.player !== state.active) throw new Error('Not your turn');
      if (action.cell < 0 || action.cell >= state.board.length) {
        throw new Error('Invalid cell');
      }
      let selection: number[];
      if (state.selection.includes(action.cell)) {
        selection = state.selection.filter((c) => c !== action.cell); // 撤销
      } else {
        if (state.selection.length >= 3) return state; // 理论上不会发生(满 3 已结算)
        selection = [...state.selection, action.cell];
      }
      if (selection.length < 3) {
        return { ...state, selection };
      }
      // 满 3 张 → 结算,见下个任务
      return resolveSelection(state, selection, ctx);
    }
    case 'RESOLVE_DONE': {
      requirePhase(state, 'resolve');
      const lr = state.lastResolve!;
      if (lr.correct) {
        if (state.scores[state.active!] >= WIN_SCORE) {
          return {
            ...state,
            phase: 'finished',
            winner: state.active,
            deadline: null,
            revealedCells: [],
            selection: [],
            lastResolve: null,
          };
        }
        // 答对未满分 → 回到准备门(readyNext=reveal:双方准备后翻记忆牌)。
        return {
          ...state,
          phase: 'ready',
          readyNext: 'reveal',
          ready: { p1: false, p2: false },
          target: null,
          active: null,
          selection: [],
          revealedCells: [],
          lastResolve: null,
          deadline: null,
        };
      }
      // 错误 → 换人继续作答(同一目标)
      return {
        ...state,
        phase: 'answering',
        active: otherPlayer(state.active!),
        selection: [],
        revealedCells: [],
        lastResolve: null,
        deadline: ctx.now + ctx.durations.answerMs,
      };
    }
    case 'ANSWER_TIMEOUT': {
      requirePhase(state, 'answering');
      return {
        ...state,
        active: otherPlayer(state.active!),
        selection: [],
        revealedCells: [],
        deadline: ctx.now + ctx.durations.answerMs,
      };
    }
    case 'REVEAL_DONE': {
      requirePhase(state, 'reveal');
      const revealIndex = (state.revealIndex + 1) % state.board.length;
      return {
        ...state,
        phase: 'countdown',
        revealIndex,
        target: null,
        active: null,
        selection: [],
        revealedCells: [],
        deadline: ctx.now + ctx.durations.countdownMs,
      };
    }
    default:
      throw new Error(`Unhandled action ${(action as Action).type}`);
  }
}

function resolveSelection(state: GameState, selection: number[], ctx: EngineCtx): GameState {
  const correct = validateAnswer(state.board, selection, state.target!);
  const scores = correct
    ? { ...state.scores, [state.active!]: state.scores[state.active!] + 1 }
    : state.scores;
  return {
    ...state,
    selection,
    scores,
    phase: 'resolve',
    lastResolve: { cells: selection, correct },
    revealedCells: selection,
    deadline: ctx.now + ctx.durations.resolveMs,
  };
}

export function toClientView(g: GameState, me: PlayerId): ClientView {
  const opp = otherPlayer(me);
  const active = g.active === null ? null : g.active === me ? 'me' : 'opp';
  const winner = g.winner === null ? null : g.winner === me ? 'me' : 'opp';
  return {
    board: g.board,
    phase: g.phase,
    target: g.target,
    scores: { me: g.scores[me], opp: g.scores[opp] },
    iAmActive: g.active === me,
    active,
    selection: g.selection,
    revealedCells: g.revealedCells,
    deadline: g.deadline,
    ready: { me: g.ready[me], opp: g.ready[opp] },
    lastResolve: g.lastResolve,
    winner,
  };
}
