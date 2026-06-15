import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type { PlayerId } from '@bw/shared';
import { RoomRegistry, makeToken } from './rooms';
import type { GameSession } from './gameSession';

function broadcastViews(io: Server, session: GameSession, roomCode: string) {
  for (const id of ['p1', 'p2'] as PlayerId[]) {
    const player = session.players[id];
    if (player?.socketId) {
      io.to(player.socketId).emit('view_update', session.viewFor(id));
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
      const { roomCode, session } = rooms.create();
      const token = makeToken();
      session.addPlayer('p1', socket.id, token);
      myRoom = roomCode;
      myId = 'p1';
      socket.join(roomCode);
      socket.emit('room_created', { roomCode, sessionToken: token });
    });

    socket.on('join_room', ({ roomCode }: { roomCode: string }) => {
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
      broadcastViews(io, session, roomCode);
    });

    void myRoom;
    void myId;
  });

  await new Promise<void>((resolve) => http.listen(port, resolve));
  const actualPort = (http.address() as { port: number }).port;

  return {
    port: actualPort,
    close: () =>
      new Promise<void>((resolve) => {
        io.close();
        http.close(() => resolve());
      }),
  };
}

// 直接运行时启动固定端口
if (process.argv[1]?.endsWith('index.ts')) {
  startServer(Number(process.env.PORT) || 3001).then(({ port }) =>
    console.log(`server on :${port}`),
  );
}
