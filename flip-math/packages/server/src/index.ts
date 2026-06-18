import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { PLAYER_IDS } from '@fm/shared';
import type { Durations, PlayerId } from '@fm/shared';
import { RoomRegistry, makeToken } from './rooms';
import type { GameSession } from './gameSession';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function broadcastViews(io: Server, session: GameSession) {
  for (const id of PLAYER_IDS) {
    const player = session.players[id];
    if (player?.socketId) {
      const view = session.viewFor(id);
      if (view !== null) io.to(player.socketId).emit('view_update', view);
    }
  }
}

function corsOrigin(): string | string[] | boolean {
  const env = process.env.CORS_ORIGIN?.trim();
  if (env) return env.split(',').map((s) => s.trim());
  return process.env.NODE_ENV === 'production' ? false : '*';
}

export interface ServerOptions {
  roomTtlMs?: number;
  sweepIntervalMs?: number;
  durations?: Durations; // 测试可注入极短时长
}

export async function startServer(
  port: number,
  options: ServerOptions = {},
): Promise<{ port: number; close: () => Promise<void> }> {
  const roomTtlMs = options.roomTtlMs ?? 10 * 60 * 1000;
  const sweepIntervalMs = options.sweepIntervalMs ?? 60 * 1000;

  const http = createServer();
  const io = new Server(http, { cors: { origin: corsOrigin() } });
  const rooms = new RoomRegistry(options.durations);

  const sweeper = setInterval(() => rooms.sweep(roomTtlMs), sweepIntervalMs);
  sweeper.unref?.();

  io.on('connection', (socket) => {
    let myRoom: string | null = null;
    let myId: PlayerId | null = null;

    socket.on('create_room', () => {
      if (myRoom !== null && rooms.get(myRoom)) {
        socket.emit('error_msg', { message: '已在房间中' });
        return;
      }
      const { roomCode, session } = rooms.create();
      const token = makeToken();
      session.addPlayer('p1', socket.id, token);
      session.broadcast = () => broadcastViews(io, session);
      myRoom = roomCode;
      myId = 'p1';
      socket.join(roomCode);
      socket.emit('room_created', { roomCode, sessionToken: token });
    });

    socket.on('join_room', (data: unknown) => {
      if (myRoom !== null && rooms.get(myRoom)) {
        socket.emit('error_msg', { message: '已在房间中' });
        return;
      }
      if (!isRecord(data) || typeof data.roomCode !== 'string') {
        socket.emit('error_msg', { message: '请求无效' });
        return;
      }
      const session = rooms.get(data.roomCode);
      if (!session) {
        socket.emit('error_msg', { message: '房间不存在' });
        return;
      }
      if (session.isFull()) {
        socket.emit('error_msg', { message: '房间已满' });
        return;
      }
      const token = makeToken();
      session.addPlayer('p2', socket.id, token);
      session.broadcast = () => broadcastViews(io, session);
      myRoom = data.roomCode;
      myId = 'p2';
      socket.join(data.roomCode);
      socket.emit('room_joined', { roomCode: data.roomCode, sessionToken: token });
      // 双方到齐 → 开局(preview)。start() 内部会广播首个视图。
      session.start();
    });

    socket.on('buzz', () => {
      if (!myRoom || !myId) return;
      const session = rooms.get(myRoom);
      if (!session) return;
      // 抢答竞态:输的一方在 answering 阶段再 buzz 会被 reduce 拒绝;静默忽略,避免噪声。
      try {
        session.dispatch({ type: 'BUZZ', player: myId });
      } catch {
        /* ignore lost buzz */
      }
    });

    socket.on('select_cell', (data: unknown) => {
      if (!myRoom || !myId) return;
      if (!isRecord(data) || typeof data.index !== 'number') {
        socket.emit('error_msg', { message: '请求无效' });
        return;
      }
      const session = rooms.get(myRoom);
      if (!session) return;
      try {
        session.dispatch({ type: 'SELECT', player: myId, cell: data.index });
      } catch (e) {
        socket.emit('error_msg', { message: (e as Error).message });
      }
    });

    socket.on('rejoin', (data: unknown) => {
      if (
        !isRecord(data) ||
        typeof data.roomCode !== 'string' ||
        typeof data.sessionToken !== 'string'
      ) {
        socket.emit('error_msg', { message: '请求无效' });
        return;
      }
      const session = rooms.get(data.roomCode);
      if (!session) {
        socket.emit('error_msg', { message: '房间不存在' });
        return;
      }
      const entry = PLAYER_IDS.map((id) => session.players[id]).find(
        (p) => p && p.sessionToken === data.sessionToken,
      );
      if (!entry) {
        socket.emit('error_msg', { message: '会话无效' });
        return;
      }
      session.markConnected(entry.id, socket.id);
      session.broadcast = () => broadcastViews(io, session);
      myRoom = data.roomCode;
      myId = entry.id;
      socket.join(data.roomCode);

      if (!session.state) {
        socket.emit('room_created', { roomCode: data.roomCode, sessionToken: data.sessionToken });
        return;
      }
      const view = session.viewFor(entry.id);
      if (view !== null) socket.emit('view_update', view);
      socket.to(data.roomCode).emit('opponent_reconnected');
    });

    socket.on('rematch', () => {
      if (!myRoom || !myId) return;
      const session = rooms.get(myRoom);
      const bothConnected =
        !!session?.isFull() && !!session.players.p1?.socketId && !!session.players.p2?.socketId;
      if (!session || !bothConnected) {
        socket.emit('error_msg', { message: '对手已离开，无法再来一局' });
        return;
      }
      if (session.state?.phase !== 'finished') return;
      session.start();
    });

    socket.on('leave_room', () => {
      if (!myRoom || !myId) return;
      const session = rooms.get(myRoom);
      // 游戏进行中(非 finished/waiting)离开 → 通知对手获胜。
      if (session?.state && session.state.phase !== 'finished') {
        socket.to(myRoom).emit('opponent_left');
      }
      rooms.delete(myRoom);
      socket.leave(myRoom);
      myRoom = null;
      myId = null;
    });

    socket.on('disconnect', () => {
      if (!myRoom || !myId) return;
      const session = rooms.get(myRoom);
      if (session) session.markDisconnected(myId);
      socket.to(myRoom).emit('opponent_disconnected');
      // 计时不停:断线者的窗口会自然超时并交替给对手,对手可继续答题直至获胜。
    });
  });

  await new Promise<void>((resolve) => http.listen(port, resolve));
  const actualPort = (http.address() as { port: number }).port;

  return {
    port: actualPort,
    close: async () => {
      clearInterval(sweeper);
      await io.close();
    },
  };
}

if (process.argv[1]?.endsWith('index.ts')) {
  startServer(Number(process.env.PORT) || 3001).then(({ port }) =>
    console.log(`flip-math server on :${port}`),
  );
}
