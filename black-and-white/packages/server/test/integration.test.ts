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
