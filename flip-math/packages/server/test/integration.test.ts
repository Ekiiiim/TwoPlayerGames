import { describe, it, expect, afterEach } from 'vitest';
import { io as ioc, type Socket } from 'socket.io-client';
import { evalExpr, WIN_SCORE } from '@fm/shared';
import type { ClientView, Cell } from '@fm/shared';
import { startServer } from '../src/index';

// 极短时长,让 preview/countdown/answer/resolve/reveal 快速推进。
const FAST = { previewMs: 40, answerMs: 80, revealMs: 20, resolveMs: 20, countdownMs: 20 };

let stop: (() => Promise<void>) | null = null;
afterEach(async () => {
  if (stop) await stop();
  stop = null;
});

function connect(port: number) {
  return ioc(`http://localhost:${port}`, { forceNew: true });
}
function once<T>(socket: Socket, ev: string): Promise<T> {
  return new Promise((res) => socket.once(ev, res as (v: unknown) => void));
}
// 等到 a 收到满足 pred 的 view_update
function waitView(socket: Socket, pred: (v: ClientView) => boolean): Promise<ClientView> {
  return new Promise((res) => {
    const handler = (v: ClientView) => {
      if (pred(v)) {
        socket.off('view_update', handler);
        res(v);
      }
    };
    socket.on('view_update', handler);
  });
}
// 在牌面上找一个等于 target 的 [c1,c2,c3]
function findSolution(board: Cell[], target: number): [number, number, number] | null {
  const nums = board.filter((c) => c.back.kind === 'num');
  const ops = board.filter((c) => c.back.kind === 'op');
  for (const x of nums) {
    for (const y of nums) {
      if (x.index === y.index) continue;
      for (const o of ops) {
        const a = (x.back as { value: number }).value;
        const b = (y.back as { value: number }).value;
        const op = (o.back as { op: '+' | '-' | '*' | '/' }).op;
        if (evalExpr(a, op, b) === target) return [x.index, o.index, y.index];
      }
    }
  }
  return null;
}

// 加入房间。返回时双方都已收到首个视图(phase==='ready' 开局准备门)。
async function createJoin(port: number) {
  const a = connect(port);
  const b = connect(port);
  a.emit('create_room');
  const { roomCode } = await once<{ roomCode: string }>(a, 'room_created');
  const pA = once<ClientView>(a, 'view_update');
  const pB = once<ClientView>(b, 'view_update');
  b.emit('join_room', { roomCode });
  const va = await pA;
  await pB;
  return { a, b, roomCode, firstView: va };
}

// 从一个 ready 准备门:双方点准备,推进过 preview/countdown,等到 buzzing(目标出现)。
// 仅在服务器确实处于 ready 阶段时调用(开局后,或上回合答对回到 ready 后)。
async function readyRound(a: Socket, b: Socket): Promise<ClientView> {
  a.emit('ready');
  b.emit('ready');
  return waitView(a, (v) => v.phase === 'buzzing');
}

// 本游戏无隐藏信息(preview 后整盘对双方公开),无需防泄露回归。
// 服务器权威性体现为:非己方回合作答被拒、得分只由服务器结算。
describe('flip-math server', () => {
  it('join -> ready gate (no target); both ready -> buzzing (target appears)', async () => {
    const { port, close } = await startServer(0, { durations: FAST });
    stop = close;
    const { a, b, firstView } = await createJoin(port);
    // 加入后首个视图是开局准备门:无目标。
    expect(firstView.phase).toBe('ready');
    expect(firstView.target).toBeNull();
    expect(firstView.ready).toEqual({ me: false, opp: false });
    // 收集到 buzzing 之前的所有视图,断言 target 在 buzzing 之前始终为 null。
    const pre: ClientView[] = [];
    const offHandler = (v: ClientView) => {
      if (v.phase !== 'buzzing') pre.push(v);
    };
    a.on('view_update', offHandler);
    const v = await readyRound(a, b);
    a.off('view_update', offHandler);
    expect(v.phase).toBe('buzzing');
    expect(v.board).toHaveLength(16);
    expect(v.target).not.toBeNull();
    for (const pv of pre) expect(pv.target).toBeNull();
    a.close();
    b.close();
  });

  it('full board (with backs) is always present in views', async () => {
    const { port, close } = await startServer(0, { durations: FAST });
    stop = close;
    const { a, b } = await createJoin(port);
    const v = await readyRound(a, b);
    for (const cell of v.board) {
      expect(cell.back).toBeDefined();
      expect(['num', 'op']).toContain(cell.back.kind);
    }
    a.close();
    b.close();
  });

  it('a correct buzz+answer scores a point', async () => {
    const { port, close } = await startServer(0, { durations: FAST });
    stop = close;
    const { a, b } = await createJoin(port);
    const buzzing = await readyRound(a, b);
    const sol = findSolution(buzzing.board, buzzing.target!);
    expect(sol).not.toBeNull();

    a.emit('buzz');
    await waitView(a, (v) => v.phase === 'answering' && v.iAmActive);
    const scored = waitView(a, (v) => v.scores.me === 1);
    for (const cell of sol!) a.emit('select_cell', { index: cell });
    const v = await scored;
    expect(v.scores.me).toBe(1);

    a.close();
    b.close();
  });

  it('a wrong answer switches the active player (no score)', async () => {
    const { port, close } = await startServer(0, { durations: FAST });
    stop = close;
    const { a, b } = await createJoin(port);
    const buzzing = await readyRound(a, b);
    // 选一个错误三张:找三张 num,num,num(必然非法)
    const nums = buzzing.board.filter((c) => c.back.kind === 'num').slice(0, 3).map((c) => c.index);

    a.emit('buzz');
    await waitView(a, (v) => v.phase === 'answering' && v.iAmActive);
    // 期望对手(b)成为 active
    const bActive = waitView(b, (v) => v.phase === 'answering' && v.iAmActive);
    for (const cell of nums) a.emit('select_cell', { index: cell });
    const vb = await bActive;
    expect(vb.iAmActive).toBe(true);
    expect(vb.scores.me).toBe(0);
    expect(vb.scores.opp).toBe(0);

    a.close();
    b.close();
  });

  it('rejects select_cell from the non-active player with error_msg', async () => {
    const { port, close } = await startServer(0, { durations: FAST });
    stop = close;
    const { a, b } = await createJoin(port);
    await readyRound(a, b);
    a.emit('buzz'); // a 抢到
    await waitView(a, (v) => v.phase === 'answering' && v.iAmActive);
    const pErr = once<{ message: string }>(b, 'error_msg');
    b.emit('select_cell', { index: 0 }); // b 不是 active
    const err = await pErr;
    expect(err.message).toBeTruthy();
    a.close();
    b.close();
  });

  it('restores view on rejoin with sessionToken', async () => {
    const { port, close } = await startServer(0, { durations: FAST });
    stop = close;
    const a = connect(port);
    const b = connect(port);
    a.emit('create_room');
    const created = await once<{ roomCode: string; sessionToken: string }>(a, 'room_created');
    const pA = once<ClientView>(a, 'view_update');
    const pB = once<ClientView>(b, 'view_update');
    b.emit('join_room', { roomCode: created.roomCode });
    await pA;
    await pB;

    a.close();
    const a2 = connect(port);
    a2.emit('rejoin', { roomCode: created.roomCode, sessionToken: created.sessionToken });
    const restored = await once<ClientView>(a2, 'view_update');
    expect(restored.board).toHaveLength(16);
    a2.close();
    b.close();
  });

  it('leave_room during play notifies the opponent (opponent_left)', async () => {
    const { port, close } = await startServer(0, { durations: FAST });
    stop = close;
    const { a, b } = await createJoin(port);
    await readyRound(a, b);
    const pLeft = once<void>(b, 'opponent_left');
    a.emit('leave_room');
    await pLeft;
    a.close();
    b.close();
  });

  it('plays to a win (first to WIN_SCORE) — connected player can run the table', async () => {
    // 只让 a 作答:a 抢答→答对→得分,循环直到 a 赢。验证 finished + winner。
    const { port, close } = await startServer(0, { durations: FAST });
    stop = close;
    const { a, b } = await createJoin(port);

    // 开局准备门 → 第 1 回合 buzzing。
    let buzzing = await readyRound(a, b);
    let done: ClientView | null = null;
    for (let round = 0; round < 30 && !done; round++) {
      const sol = findSolution(buzzing.board, buzzing.target!);
      const targetScore = buzzing.scores.me + 1;
      a.emit('buzz');
      await waitView(a, (v) => v.phase === 'answering' && v.iAmActive);
      const progressed = waitView(
        a,
        (v) => v.scores.me === targetScore || v.phase === 'finished',
      );
      for (const cell of sol!) a.emit('select_cell', { index: cell });
      let v = await progressed;
      // 得分先于 resolve 阶段写入,finished 在随后的 RESOLVE_DONE 才到达;
      // 命中胜分但仍在 resolve 时,继续等待终局视图。
      if (v.phase !== 'finished' && v.scores.me >= WIN_SCORE) {
        v = await waitView(a, (w) => w.phase === 'finished');
      }
      if (v.phase === 'finished') {
        done = v;
        break;
      }
      // 答对未满分 → 回到下一回合的准备门 → 再次准备到 buzzing。
      await waitView(a, (w) => w.phase === 'ready');
      buzzing = await readyRound(a, b);
    }
    expect(done).not.toBeNull();
    expect(done!.winner).toBe('me');
    expect(done!.scores.me).toBe(WIN_SCORE);

    a.close();
    b.close();
  }, 20000);
});
