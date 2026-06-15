import { describe, it, expect, afterEach } from 'vitest';
import { io as ioc, type Socket } from 'socket.io-client';
import { startServer } from '../src/index';

let stop: (() => Promise<void>) | null = null;
afterEach(async () => {
  if (stop) await stop();
  stop = null;
});

function connect(port: number) {
  return ioc(`http://localhost:${port}`, { forceNew: true });
}
function once<T>(socket: any, ev: string): Promise<T> {
  return new Promise((res) => socket.once(ev, res));
}

describe('server smoke', () => {
  it('accepts a socket connection', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const c: Socket = ioc(`http://localhost:${port}`);
    await new Promise<void>((resolve) => c.on('connect', () => resolve()));
    expect(c.connected).toBe(true);
    c.close();
  });
});

describe('rooms', () => {
  it('create then join starts the game for both', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const a = connect(port);
    const b = connect(port);

    a.emit('create_room');
    const created = await once<{ roomCode: string; sessionToken: string }>(a, 'room_created');
    expect(created.roomCode).toMatch(/^[A-Z0-9]{6}$/);

    // 注册两个监听器后再触发 join_room，避免事件到达顺序导致的竞态
    const pA = once<any>(a, 'view_update');
    const pB = once<any>(b, 'view_update');
    b.emit('join_room', { roomCode: created.roomCode });
    const startA = await pA;
    const startB = await pB;
    expect(startA.phase).toBe('playing');
    expect(startB.phase).toBe('playing');
    // 恰好一方是本回合 leader
    expect(startA.currentRound.iAmLeader).not.toBe(startB.currentRound.iAmLeader);

    a.close(); b.close();
  });
});

describe('play_card flow', () => {
  it('leader color is revealed to follower before they play', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const a = connect(port); const b = connect(port);
    a.emit('create_room');
    const { roomCode } = await once<any>(a, 'room_created');

    const pA0 = once<any>(a, 'view_update');
    const pB0 = once<any>(b, 'view_update');
    b.emit('join_room', { roomCode });
    const va0 = await pA0;
    await pB0;

    // 找出 leader
    const leader = va0.currentRound.iAmLeader ? a : b;
    const follower = leader === a ? b : a;

    const pFollowerView = once<any>(follower, 'view_update');
    leader.emit('play_card', { card: 6 });          // 6 = black
    const fView = await pFollowerView;
    expect(fView.currentRound.leaderHasPlayed).toBe(true);
    expect(fView.currentRound.leaderColor).toBe('black');
    // follower 视图里不应出现 leader 的数字 6
    expect(JSON.stringify(fView)).not.toContain('"6"');

    a.close(); b.close();
  });
});

describe('anti-cheat', () => {
  it('opponent real numbers are never structurally exposed across a full game', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const a = connect(port); const b = connect(port);

    const receivedA: any[] = [];
    const receivedB: any[] = [];
    a.on('view_update', (v: unknown) => receivedA.push(v));
    b.on('view_update', (v: unknown) => receivedB.push(v));

    a.emit('create_room');
    const { roomCode } = await once<any>(a, 'room_created');

    const pA0 = once<any>(a, 'view_update');
    const pB0 = once<any>(b, 'view_update');
    b.emit('join_room', { roomCode });
    let va = await pA0;
    await pB0;

    // 双方各持 0..8；逐回合由 leader 先出
    const handA = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const handB = [0, 1, 2, 3, 4, 5, 6, 7, 8];

    for (let r = 0; r < 9; r++) {
      const aIsLeader = va.currentRound.iAmLeader;
      const leaderSock = aIsLeader ? a : b;
      const followerSock = aIsLeader ? b : a;
      const leaderCard = (aIsLeader ? handA : handB).shift()!;
      const followerCard = (aIsLeader ? handB : handA).shift()!;

      // leader 出牌：双方都会收到 view_update（follower 视图里出现 leaderColor）
      const pA1 = once<any>(a, 'view_update');
      const pB1 = once<any>(b, 'view_update');
      leaderSock.emit('play_card', { card: leaderCard });
      await pA1;
      await pB1;

      // follower 出牌：结算，双方再收到一次 view_update
      const pA2 = once<any>(a, 'view_update');
      const pB2 = once<any>(b, 'view_update');
      followerSock.emit('play_card', { card: followerCard });
      const vA2 = await pA2;
      await pB2;

      va = vA2;
    }

    a.close(); b.close();

    // 结构性断言：跨整局，对手的真实数字从不以原始数字形式出现，
    // 只能以颜色（black/white）和剩牌数（数字计数）暴露。
    for (const v of [...receivedA, ...receivedB]) {
      // 不存在任何原始“对手已出牌”数组
      expect(v).not.toHaveProperty('opponentPlayedCards');
      // 对手信息仅限：颜色数组 + 剩牌计数
      expect(Array.isArray(v.opponentPlayedColors)).toBe(true);
      for (const c of v.opponentPlayedColors) {
        expect(['black', 'white']).toContain(c);
      }
      expect(typeof v.opponentCardsLeft).toBe('number');

      // 当前回合：若先手已出牌，只暴露颜色，不暴露原始数字字段
      if (v.currentRound.leaderHasPlayed) {
        expect(['black', 'white']).toContain(v.currentRound.leaderColor);
        expect(v.currentRound).not.toHaveProperty('leaderCard');
      }
    }
  });
});
