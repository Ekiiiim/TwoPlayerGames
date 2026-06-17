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

/** Play a full 9-round game between sockets a and b. Returns the final view for a. */
async function playFullGame(a: Socket, b: Socket, port: number) {
  a.emit('create_room');
  const { roomCode } = await once<any>(a, 'room_created');

  const pA0 = once<any>(a, 'view_update');
  const pB0 = once<any>(b, 'view_update');
  b.emit('join_room', { roomCode });
  let va = await pA0;
  await pB0;

  const handA = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const handB = [0, 1, 2, 3, 4, 5, 6, 7, 8];

  for (let r = 0; r < 9; r++) {
    const aIsLeader = va.currentRound.iAmLeader;
    const leaderSock = aIsLeader ? a : b;
    const followerSock = aIsLeader ? b : a;
    const leaderCard = (aIsLeader ? handA : handB).shift()!;
    const followerCard = (aIsLeader ? handB : handA).shift()!;

    const pA1 = once<any>(a, 'view_update');
    const pB1 = once<any>(b, 'view_update');
    leaderSock.emit('play_card', { card: leaderCard });
    await pA1;
    await pB1;

    const pA2 = once<any>(a, 'view_update');
    const pB2 = once<any>(b, 'view_update');
    followerSock.emit('play_card', { card: followerCard });
    const vA2 = await pA2;
    await pB2;
    va = vA2;
  }
  return va;
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
    expect(created.roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

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

describe('rejoin', () => {
  it('restores view after reconnect with sessionToken', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const a = connect(port); const b = connect(port);
    a.emit('create_room');
    const created = await once<any>(a, 'room_created');

    const pA0 = once<any>(a, 'view_update');
    const pB0 = once<any>(b, 'view_update');
    b.emit('join_room', { roomCode: created.roomCode });
    await pA0;
    await pB0;

    a.close(); // p1 掉线
    const a2 = connect(port);
    a2.emit('rejoin', { roomCode: created.roomCode, sessionToken: created.sessionToken });
    const restored = await once<any>(a2, 'view_update');
    expect(restored.phase).toBe('playing');
    a2.close(); b.close();
  });

  it('handles missing/invalid payload without crashing (item 10a)', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const a = connect(port);
    await once<void>(a, 'connect');

    // Send rejoin with undefined payload (no fields at all)
    const pErr = once<any>(a, 'error_msg');
    a.emit('rejoin', undefined);
    const err = await pErr;
    expect(err.message).toBeTruthy();
    a.close();

    // Verify server still alive: a new socket can create_room
    const c = connect(port);
    await once<void>(c, 'connect');
    c.emit('create_room');
    const created = await once<any>(c, 'room_created');
    expect(created.roomCode).toBeTruthy();
    c.close();
  });

  it('restores the waiting room (room_created) when rejoining before the game started (item 10b)', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    // p1 creates a room but p2 never joins (game not started)
    const a = connect(port);
    a.emit('create_room');
    const created = await once<any>(a, 'room_created');
    a.close(); // p1 refreshes / disconnects

    // p1 rejoins before the game started — should be put back into the waiting
    // room (room_created with the same code), NOT shown an error.
    const a2 = connect(port);
    await once<void>(a2, 'connect');
    const pRestored = once<any>(a2, 'room_created');
    const pErr = once<any>(a2, 'error_msg');
    a2.emit('rejoin', { roomCode: created.roomCode, sessionToken: created.sessionToken });
    const restored = await Promise.race([
      pRestored,
      pErr.then((e: any) => {
        throw new Error(`expected room_created but got error_msg: ${e.message}`);
      }),
    ]);
    expect((restored as any).roomCode).toBe(created.roomCode);

    // The restored host is still p1: a second player can now join and start the game
    const b = connect(port);
    const pView = once<any>(a2, 'view_update');
    b.emit('join_room', { roomCode: created.roomCode });
    const view = await pView;
    expect(view.phase).toBe('playing');

    a2.close(); b.close();
  });
});

describe('game_over event (item 8)', () => {
  it('fires game_over for both players with well-formed GameReview at game end', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const a = connect(port);
    const b = connect(port);

    const pGameOverA = once<any>(a, 'game_over');
    const pGameOverB = once<any>(b, 'game_over');

    await playFullGame(a, b, port);

    const reviewA = await pGameOverA;
    const reviewB = await pGameOverB;

    for (const review of [reviewA, reviewB]) {
      expect(review.rounds).toHaveLength(9);
      expect(typeof review.finalScore.me).toBe('number');
      expect(typeof review.finalScore.opp).toBe('number');
      expect(['me', 'opp', 'draw']).toContain(review.winner);
    }

    a.close(); b.close();
  });
});

describe('rejoin after game end', () => {
  it('receives game_over with well-formed GameReview (9 rounds, valid winner) on rejoin', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const a = connect(port);
    const b = connect(port);

    // create room and capture sessionToken for later rejoin
    a.emit('create_room');
    const created = await once<any>(a, 'room_created');
    const { roomCode, sessionToken } = created;

    // register game_over listener BEFORE joining/playing so we don't miss the event
    const pGameOverA = once<any>(a, 'game_over');

    const pA0 = once<any>(a, 'view_update');
    const pB0 = once<any>(b, 'view_update');
    b.emit('join_room', { roomCode });
    let va = await pA0;
    await pB0;

    // play all 9 rounds
    const handA = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const handB = [0, 1, 2, 3, 4, 5, 6, 7, 8];

    for (let r = 0; r < 9; r++) {
      const aIsLeader = va.currentRound.iAmLeader;
      const leaderSock = aIsLeader ? a : b;
      const followerSock = aIsLeader ? b : a;
      const leaderCard = (aIsLeader ? handA : handB).shift()!;
      const followerCard = (aIsLeader ? handB : handA).shift()!;

      const pA1 = once<any>(a, 'view_update');
      const pB1 = once<any>(b, 'view_update');
      leaderSock.emit('play_card', { card: leaderCard });
      await pA1;
      await pB1;

      const pA2 = once<any>(a, 'view_update');
      const pB2 = once<any>(b, 'view_update');
      followerSock.emit('play_card', { card: followerCard });
      const vA2 = await pA2;
      await pB2;
      va = vA2;
    }

    // wait for the game_over that fires when the last round resolves
    await pGameOverA;

    // p1 (a) disconnects and rejoins
    a.close();

    const a2 = connect(port);
    const pView = once<any>(a2, 'view_update');
    const pReview = once<any>(a2, 'game_over');
    a2.emit('rejoin', { roomCode, sessionToken });

    await pView;
    const review = await pReview;

    expect(review.rounds).toHaveLength(9);
    expect(typeof review.finalScore.me).toBe('number');
    expect(typeof review.finalScore.opp).toBe('number');
    expect(['me', 'opp', 'draw']).toContain(review.winner);

    a2.close(); b.close();
  }, 15000);
});

describe('leave_room (explicit forfeit)', () => {
  it('opponent receives opponent_left when a player emits leave_room during a game', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const a = connect(port);
    const b = connect(port);

    a.emit('create_room');
    const { roomCode } = await once<any>(a, 'room_created');

    // Register listeners before emitting join_room to avoid broadcast race
    const pA0 = once<any>(a, 'view_update');
    const pB0 = once<any>(b, 'view_update');
    b.emit('join_room', { roomCode });
    await pA0;
    await pB0;

    // Register opponent_left listener on b BEFORE a emits leave_room
    const pOpponentLeft = once<any>(b, 'opponent_left');
    a.emit('leave_room');
    await pOpponentLeft; // b must receive opponent_left

    a.close(); b.close();
  });

  it('after leave_room the room is destroyed: join_room with that code yields error_msg (房间不存在)', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const a = connect(port);
    const b = connect(port);

    a.emit('create_room');
    const { roomCode } = await once<any>(a, 'room_created');

    const pA0 = once<any>(a, 'view_update');
    const pB0 = once<any>(b, 'view_update');
    b.emit('join_room', { roomCode });
    await pA0;
    await pB0;

    // a leaves; wait for b to be notified before proceeding
    const pOpponentLeft = once<any>(b, 'opponent_left');
    a.emit('leave_room');
    await pOpponentLeft;

    // Now a third socket tries to join the (now-deleted) room
    const c = connect(port);
    await once<void>(c, 'connect');
    const pErr = once<any>(c, 'error_msg');
    c.emit('join_room', { roomCode });
    const err = await pErr;
    expect(err.message).toBe('房间不存在');

    a.close(); b.close(); c.close();
  });

  it('leave_room when not in a room does not crash; server still handles create_room', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const a = connect(port);
    await once<void>(a, 'connect');

    // Emit leave_room with no prior room membership — must not throw
    a.emit('leave_room');

    // Give server a tick to process
    await new Promise((r) => setTimeout(r, 50));

    // Server still alive: can create_room afterwards
    const pCreated = once<any>(a, 'room_created');
    a.emit('create_room');
    const created = await pCreated;
    expect(created.roomCode).toBeTruthy();

    a.close();
  });
});

describe('out-of-turn play_card (item 9)', () => {
  it('produces error_msg matching /not your turn/i and does not crash the server', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const a = connect(port);
    const b = connect(port);

    a.emit('create_room');
    const { roomCode } = await once<any>(a, 'room_created');

    const pA0 = once<any>(a, 'view_update');
    const pB0 = once<any>(b, 'view_update');
    b.emit('join_room', { roomCode });
    const va0 = await pA0;
    await pB0;

    // Determine the follower (not their turn yet)
    const follower = va0.currentRound.iAmLeader ? b : a;

    // Follower tries to play out of turn
    const pErr = once<any>(follower, 'error_msg');
    follower.emit('play_card', { card: 3 });
    const err = await pErr;
    expect(err.message).toMatch(/not your turn/i);

    // Server still alive
    a.close(); b.close();
    const c = connect(port);
    await once<void>(c, 'connect');
    c.emit('create_room');
    const newRoom = await once<any>(c, 'room_created');
    expect(newRoom.roomCode).toBeTruthy();
    c.close();
  });
});

describe('rematch (再来一局)', () => {
  it('restarts a fresh game in the same room for both players after it finished', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const a = connect(port);
    const b = connect(port);

    // Make sure both reach game_over (state = finished) before rematch
    const pOverA = once<any>(a, 'game_over');
    const pOverB = once<any>(b, 'game_over');
    await playFullGame(a, b, port);
    await pOverA;
    await pOverB;

    // Either player can trigger the rematch
    const pA = once<any>(a, 'view_update');
    const pB = once<any>(b, 'view_update');
    a.emit('rematch');
    const na = await pA;
    const nb = await pB;

    expect(na.phase).toBe('playing');
    expect(nb.phase).toBe('playing');
    expect(na.currentRound.index).toBe(1);
    expect(na.scores).toEqual({ me: 0, opp: 0 });
    expect(nb.scores).toEqual({ me: 0, opp: 0 });
    // Exactly one player leads the new round
    expect(na.currentRound.iAmLeader).not.toBe(nb.currentRound.iAmLeader);

    a.close(); b.close();
  }, 15000);

  it('refuses to rematch when the opponent has left, with error_msg', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const a = connect(port);
    const b = connect(port);

    const pOverA = once<any>(a, 'game_over');
    await playFullGame(a, b, port);
    await pOverA;

    // Opponent disconnects
    b.close();
    await new Promise((r) => setTimeout(r, 50));

    const pErr = once<any>(a, 'error_msg');
    a.emit('rematch');
    const err = await pErr;
    expect(err.message).toContain('对手');

    a.close();
  }, 15000);
});

describe('stale room membership recovery', () => {
  it('a player whose room was destroyed can still create_room (no 已在房间中)', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const a = connect(port);
    const b = connect(port);

    a.emit('create_room');
    const { roomCode } = await once<any>(a, 'room_created');

    const pA0 = once<any>(a, 'view_update');
    const pB0 = once<any>(b, 'view_update');
    b.emit('join_room', { roomCode });
    await pA0;
    await pB0;

    // b leaves: the room is destroyed and a is notified, but a never emitted
    // leave_room — its server-side membership is now stale (points at a gone room).
    const pLeft = once<any>(a, 'opponent_left');
    b.emit('leave_room');
    await pLeft;

    // a should be able to create a brand-new room rather than being stuck on 已在房间中
    const pCreated = once<any>(a, 'room_created');
    const pErr = once<any>(a, 'error_msg');
    a.emit('create_room');
    const created = await Promise.race([
      pCreated,
      pErr.then((e: any) => {
        throw new Error(`expected room_created but got error_msg: ${e.message}`);
      }),
    ]);
    expect((created as any).roomCode).toBeTruthy();

    a.close(); b.close();
  });
});
