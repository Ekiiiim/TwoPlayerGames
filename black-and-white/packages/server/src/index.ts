import { createServer } from "node:http";
import { Server } from "socket.io";
import { playCard, PLAYER_IDS } from "@bw/shared";
import type { PlayerId } from "@bw/shared";
import { RoomRegistry, makeToken } from "./rooms";
import type { GameSession } from "./gameSession";

// Narrowing guard for untrusted socket payloads — lets the handlers check
// fields with plain `typeof data.x` instead of scattering `as any` casts.
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function broadcastViews(io: Server, session: GameSession) {
  for (const id of PLAYER_IDS) {
    const player = session.players[id];
    if (player?.socketId) {
      const view = session.viewFor(id);
      if (view !== null) {
        io.to(player.socketId).emit("view_update", view);
      }
    }
  }
}

function broadcastReview(io: Server, session: GameSession) {
  for (const id of PLAYER_IDS) {
    const player = session.players[id];
    if (player?.socketId) {
      const review = session.reviewFor(id);
      if (review !== null) {
        io.to(player.socketId).emit("game_over", review);
      }
    }
  }
}

// Cross-origin policy: in production the client is served same-origin behind
// Caddy, so no CORS is needed (origin: false). In dev we allow any origin for
// convenience. CORS_ORIGIN (comma-separated) overrides in either case.
function corsOrigin(): string | string[] | boolean {
  const env = process.env.CORS_ORIGIN?.trim();
  if (env) return env.split(",").map((s) => s.trim());
  return process.env.NODE_ENV === "production" ? false : "*";
}

export interface ServerOptions {
  // How long a fully-empty room lingers before garbage collection (default 10m).
  roomTtlMs?: number;
  // How often the abandoned-room sweep runs (default 60s).
  sweepIntervalMs?: number;
}

export async function startServer(
  port: number,
  options: ServerOptions = {},
): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const roomTtlMs = options.roomTtlMs ?? 10 * 60 * 1000;
  const sweepIntervalMs = options.sweepIntervalMs ?? 60 * 1000;

  const http = createServer();
  const io = new Server(http, { cors: { origin: corsOrigin() } });

  const rooms = new RoomRegistry();

  // Periodically reclaim rooms abandoned by both players (tabs closed without an
  // explicit leave_room). unref so the timer never keeps the process alive.
  const sweeper = setInterval(() => rooms.sweep(roomTtlMs), sweepIntervalMs);
  sweeper.unref?.();

  io.on("connection", (socket) => {
    let myRoom: string | null = null;
    let myId: PlayerId | null = null;

    socket.on("create_room", () => {
      // Item 5: Guard double create_room on one socket — but only while the room
      // still exists. Stale membership (the room was already destroyed) must not
      // lock the player out; fall through and let them create a fresh room.
      if (myRoom !== null && rooms.get(myRoom)) {
        socket.emit("error_msg", { message: "已在房间中" });
        return;
      }
      const { roomCode, session } = rooms.create();
      const token = makeToken();
      session.addPlayer("p1", socket.id, token);
      myRoom = roomCode;
      myId = "p1";
      socket.join(roomCode);
      socket.emit("room_created", { roomCode, sessionToken: token });
    });

    socket.on("join_room", (data: unknown) => {
      // Same as create_room: only block if the existing room is still live.
      if (myRoom !== null && rooms.get(myRoom)) {
        socket.emit("error_msg", { message: "已在房间中" });
        return;
      }
      if (!isRecord(data) || typeof data.roomCode !== "string") {
        socket.emit("error_msg", { message: "请求无效" });
        return;
      }
      const roomCode = data.roomCode;
      const session = rooms.get(roomCode);
      if (!session) {
        socket.emit("error_msg", { message: "房间不存在" });
        return;
      }
      if (session.isFull()) {
        socket.emit("error_msg", { message: "房间已满" });
        return;
      }
      const token = makeToken();
      session.addPlayer("p2", socket.id, token);
      myRoom = roomCode;
      myId = "p2";
      socket.join(roomCode);
      socket.emit("room_joined", { roomCode, sessionToken: token });

      // 抛硬币定先手并开局
      const firstLeader: PlayerId = Math.random() < 0.5 ? "p1" : "p2";
      session.start(firstLeader);
      broadcastViews(io, session);
    });

    socket.on("play_card", (data: unknown) => {
      if (!myRoom || !myId) return;
      if (!isRecord(data) || typeof data.card !== "number") {
        socket.emit("error_msg", { message: "请求无效" });
        return;
      }
      const card = data.card;
      const session = rooms.get(myRoom);
      if (!session || !session.state) return;
      try {
        session.state = playCard(session.state, myId, card);
      } catch (e) {
        socket.emit("error_msg", { message: (e as Error).message });
        return;
      }
      broadcastViews(io, session);
      if (session.state.phase === "finished") {
        broadcastReview(io, session);
      }
    });

    socket.on("rejoin", (data: unknown) => {
      if (
        !isRecord(data) ||
        typeof data.roomCode !== "string" ||
        typeof data.sessionToken !== "string"
      ) {
        socket.emit("error_msg", { message: "请求无效" });
        return;
      }
      const roomCode = data.roomCode;
      const sessionToken = data.sessionToken;
      const session = rooms.get(roomCode);
      if (!session) {
        socket.emit("error_msg", { message: "房间不存在" });
        return;
      }
      const entry = PLAYER_IDS.map((id) => session.players[id]).find(
        (p) => p && p.sessionToken === sessionToken,
      );
      if (!entry) {
        socket.emit("error_msg", { message: "会话无效" });
        return;
      }
      // Restore this player's connection to the room
      session.markConnected(entry.id, socket.id);
      myRoom = roomCode;
      myId = entry.id;
      socket.join(roomCode);

      // Game hasn't started yet (host refreshed while waiting for an opponent):
      // put them back into the waiting room rather than showing an error.
      if (!session.state) {
        socket.emit("room_created", { roomCode, sessionToken });
        return;
      }
      const view = session.viewFor(entry.id);
      if (view !== null) {
        socket.emit("view_update", view);
      }
      if (session.state.phase === "finished") {
        const review = session.reviewFor(entry.id);
        if (review !== null) {
          socket.emit("game_over", review);
        }
      }
      socket.to(roomCode).emit("opponent_reconnected");
    });

    socket.on("rematch", () => {
      if (!myRoom || !myId) return;
      const session = rooms.get(myRoom);
      const bothConnected =
        !!session?.isFull() &&
        !!session.players.p1?.socketId &&
        !!session.players.p2?.socketId;
      if (!session || !bothConnected) {
        socket.emit("error_msg", { message: "对手已离开，无法再来一局" });
        return;
      }
      // Only restart once the previous game has actually finished
      if (session.state?.phase !== "finished") return;
      const firstLeader: PlayerId = Math.random() < 0.5 ? "p1" : "p2";
      session.start(firstLeader);
      broadcastViews(io, session);
    });

    socket.on("leave_room", () => {
      if (!myRoom || !myId) return;
      const session = rooms.get(myRoom);
      // Only notify the opponent of a forfeit win when a game is actually in
      // progress. Leaving after the game finished is a plain cleanup.
      if (session?.state && session.state.phase === "playing") {
        socket.to(myRoom).emit("opponent_left");
      }
      rooms.delete(myRoom);
      socket.leave(myRoom);
      myRoom = null;
      myId = null;
    });

    socket.on("disconnect", () => {
      if (!myRoom || !myId) return;
      const session = rooms.get(myRoom);
      if (session) session.markDisconnected(myId);
      socket.to(myRoom).emit("opponent_disconnected");
    });
  });

  await new Promise<void>((resolve) => http.listen(port, resolve));
  const actualPort = (http.address() as { port: number }).port;

  return {
    port: actualPort,
    // Item 4: await io.close() for clean teardown
    close: async () => {
      clearInterval(sweeper);
      await io.close();
    },
  };
}

// 直接运行时启动固定端口
if (process.argv[1]?.endsWith("index.ts")) {
  startServer(Number(process.env.PORT) || 3001).then(({ port }) =>
    console.log(`server on :${port}`),
  );
}
