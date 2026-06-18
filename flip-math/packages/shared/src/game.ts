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
