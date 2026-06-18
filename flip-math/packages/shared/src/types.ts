export type PlayerId = 'p1' | 'p2';
export type Operator = '+' | '-' | '*' | '/';

export type CellBack =
  | { kind: 'num'; value: number } // 1..12
  | { kind: 'op'; op: Operator };

export interface Cell {
  index: number;   // 0..15
  letter: string;  // 'A'..'P'(阅读顺序)
  back: CellBack;
}

export type Phase =
  | 'waiting'
  | 'preview'
  | 'buzzing'
  | 'answering'
  | 'resolve'
  | 'reveal'
  | 'finished';

export interface Durations {
  previewMs: number;
  answerMs: number;
  revealMs: number;
  resolveMs: number;
}

// 引擎上下文:把"现在"和时长作为数据传入,保持 reduce 纯函数、可确定性单测。
export interface EngineCtx {
  now: number;
  durations: Durations;
}

export interface GameState {
  board: Cell[];
  scores: Record<PlayerId, number>;
  phase: Phase;
  target: number | null;
  active: PlayerId | null;                       // 当前答题者
  selection: number[];                           // 当前答题者已点的格子索引(点击顺序,≤3)
  revealIndex: number;                           // 记忆翻牌游标 0..15
  revealedCells: number[];                       // 渲染提示:当前应翻到反面的格子
  lastResolve: { cells: number[]; correct: boolean } | null;
  deadline: number | null;                       // 当前计时阶段的绝对到点时间(epoch ms)
  winner: PlayerId | null;
}

export type Action =
  | { type: 'PREVIEW_DONE' }
  | { type: 'BUZZ'; player: PlayerId }
  | { type: 'SELECT'; player: PlayerId; cell: number }
  | { type: 'ANSWER_TIMEOUT' }
  | { type: 'RESOLVE_DONE' }
  | { type: 'REVEAL_DONE' };

export interface ClientView {
  board: Cell[];                  // 整盘(本游戏无机密)
  phase: Phase;
  target: number | null;
  scores: { me: number; opp: number };
  iAmActive: boolean;
  active: 'me' | 'opp' | null;
  selection: number[];            // 当前答题者已选索引(双方可见,用于列出字母)
  revealedCells: number[];
  deadline: number | null;
  winner: 'me' | 'opp' | null;
}
