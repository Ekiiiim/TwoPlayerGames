import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { playCard, type PlayerId } from '@bw/shared';
import { RoomRegistry, makeToken } from './rooms';
import type { GameSession } from './gameSession';

// Item 3: Remove unused roomCode parameter from broadcastViews and broadcastReview
function broadcastViews(io: Server, session: GameSession) {
  for (const id of ['p1', 'p2'] as PlayerId[]) {
    const player = session.players[id];
    if (player?.socketId) {
      const view = session.viewFor(id);
      if (view !== null) {
        io.to(player.socketId).emit('view_update', view);
      }
    }
  }
}

// Item 3: Remove unused roomCode parameter from broadcastReview
function broadcastReview(io: Server, session: GameSession) {
  for (const id of ['p1', 'p2'] as PlayerId[]) {
    const player = session.players[id];
    if (player?.socketId) {
      const review = session.reviewFor(id);
      if (review !== null) {
        io.to(player.socketId).emit('game_over', review);
      }
    }
  }
}

export async function startServer(port: number): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const http = createServer();
  const io = new Server(http, { cors: { origin: '*' } });

  const rooms = new RoomRegistry();

  io.on('connection', (socket) => {
    let myRoom: string | null = null;
    let myId: PlayerId | null = null;

    socket.on('create_room', () => {
      // Item 5: Guard double create_room on one socket — but only while the room
      // still exists. Stale membership (the room was already destroyed) must not
      // lock the player out; fall through and let them create a fresh room.
      if (myRoom !== null && rooms.get(myRoom)) {
        socket.emit('error_msg', { message: '已在房间中' });
        return;
      }
      const { roomCode, session } = rooms.create();
      const token = makeToken();
      session.addPlayer('p1', socket.id, token);
      myRoom = roomCode;
      myId = 'p1';
      socket.join(roomCode);
      socket.emit('room_created', { roomCode, sessionToken: token });
    });

    socket.on('join_room', (data: unknown) => {
      // Same as create_room: only block if the existing room is still live.
      if (myRoom !== null && rooms.get(myRoom)) {
        socket.emit('error_msg', { message: '已在房间中' });
        return;
      }
      // Item 1: Guard malformed/missing payload
      if (!data || typeof data !== 'object' || typeof (data as any).roomCode !== 'string') {
        socket.emit('error_msg', { message: '请求无效' });
        return;
      }
      const { roomCode } = data as { roomCode: string };
      const session = rooms.get(roomCode);
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
      myRoom = roomCode;
      myId = 'p2';
      socket.join(roomCode);
      socket.emit('room_joined', { roomCode, sessionToken: token });

      // 抛硬币定先手并开局
      const firstLeader: PlayerId = Math.random() < 0.5 ? 'p1' : 'p2';
      session.start(firstLeader);
      broadcastViews(io, session);
    });

    socket.on('play_card', (data: unknown) => {
      if (!myRoom || !myId) return;
      // Item 1: Guard malformed payload
      if (!data || typeof data !== 'object' || typeof (data as any).card !== 'number') {
        socket.emit('error_msg', { message: '请求无效' });
        return;
      }
      const { card } = data as { card: number };
      const session = rooms.get(myRoom);
      if (!session || !session.state) return;
      try {
        session.state = playCard(session.state, myId, card);
      } catch (e) {
        socket.emit('error_msg', { message: (e as Error).message });
        return;
      }
      broadcastViews(io, session);
      if (session.state.phase === 'finished') {
        broadcastReview(io, session);
      }
    });

    socket.on('rejoin', (data: unknown) => {
      // Item 1: Guard malformed/missing payload
      if (
        !data ||
        typeof data !== 'object' ||
        typeof (data as any).roomCode !== 'string' ||
        typeof (data as any).sessionToken !== 'string'
      ) {
        socket.emit('error_msg', { message: '请求无效' });
        return;
      }
      const { roomCode, sessionToken } = data as { roomCode: string; sessionToken: string };
      const session = rooms.get(roomCode);
      if (!session) {
        socket.emit('error_msg', { message: '房间不存在' });
        return;
      }
      const entry = (['p1', 'p2'] as PlayerId[])
        .map((id) => session.players[id])
        .find((p) => p && p.sessionToken === sessionToken);
      if (!entry) {
        socket.emit('error_msg', { message: '会话无效' });
        return;
      }
      // Item 2: Guard rejoin before game has started — state is null
      if (!session.state) {
        socket.emit('error_msg', { message: '对局尚未开始' });
        return;
      }
      entry.socketId = socket.id;
      myRoom = roomCode;
      myId = entry.id;
      socket.join(roomCode);
      const view = session.viewFor(entry.id);
      if (view !== null) {
        socket.emit('view_update', view);
      }
      if (session.state.phase === 'finished') {
        const review = session.reviewFor(entry.id);
        if (review !== null) {
          socket.emit('game_over', review);
        }
      }
      socket.to(roomCode).emit('opponent_reconnected');
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
      // Only restart once the previous game has actually finished
      if (session.state?.phase !== 'finished') return;
      const firstLeader: PlayerId = Math.random() < 0.5 ? 'p1' : 'p2';
      session.start(firstLeader);
      broadcastViews(io, session);
    });

    socket.on('leave_room', () => {
      if (!myRoom || !myId) return;
      const session = rooms.get(myRoom);
      // Only notify the opponent of a forfeit win when a game is actually in
      // progress. Leaving after the game finished is a plain cleanup.
      if (session?.state && session.state.phase === 'playing') {
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
      const player = session?.players[myId];
      if (player) player.socketId = null;
      socket.to(myRoom).emit('opponent_disconnected');
    });
  });

  await new Promise<void>((resolve) => http.listen(port, resolve));
  const actualPort = (http.address() as { port: number }).port;

  return {
    port: actualPort,
    // Item 4: await io.close() for clean teardown
    close: async () => {
      await io.close();
    },
  };
}

// 直接运行时启动固定端口
if (process.argv[1]?.endsWith('index.ts')) {
  startServer(Number(process.env.PORT) || 3001).then(({ port }) =>
    console.log(`server on :${port}`),
  );
}
