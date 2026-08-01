import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  DEFAULT_CONFIG,
  PLAYER_IDS,
  type Card,
  type GameConfig,
  type PlayerAction,
  type PlayerId,
} from "@texas-poker/shared";
import type { GameSession } from "./gameSession";
import { makeToken, RoomRegistry } from "./rooms";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function corsOrigin(): string | string[] | boolean {
  const env = process.env.CORS_ORIGIN?.trim();
  if (env) return env.split(",").map((item) => item.trim());
  return process.env.NODE_ENV === "production" ? false : "*";
}

function parseAction(data: unknown): PlayerAction | null {
  if (!isRecord(data) || typeof data.type !== "string") return null;
  if (data.type === "bet" || data.type === "raise") {
    if (typeof data.amount !== "number") return null;
    return { type: data.type, amount: data.amount };
  }
  if (
    data.type === "fold" ||
    data.type === "check" ||
    data.type === "call" ||
    data.type === "all-in"
  ) {
    return { type: data.type };
  }
  return null;
}

function parseSettings(
  data: unknown,
): Partial<Pick<GameConfig, "enforceMinRaise">> | null {
  if (!isRecord(data)) return null;
  const settings: Partial<Pick<GameConfig, "enforceMinRaise">> = {};
  if ("enforceMinRaise" in data) {
    if (typeof data.enforceMinRaise !== "boolean") return null;
    settings.enforceMinRaise = data.enforceMinRaise;
  }
  return settings;
}

function broadcastViews(io: Server, session: GameSession): void {
  for (const id of PLAYER_IDS) {
    const player = session.players[id];
    if (player?.socketId) {
      const view = session.viewFor(id);
      if (view) io.to(player.socketId).emit("view_update", view);
    }
  }
}

export interface ServerOptions {
  deck?: Card[];
  config?: GameConfig;
  roomTtlMs?: number;
  sweepIntervalMs?: number;
}

export async function startServer(
  port: number,
  options: ServerOptions = {},
): Promise<{ port: number; close: () => Promise<void> }> {
  const roomTtlMs = options.roomTtlMs ?? 10 * 60 * 1000;
  const sweepIntervalMs = options.sweepIntervalMs ?? 60 * 1000;
  const deckFactory = options.deck ? () => [...options.deck!] : undefined;
  const rooms = new RoomRegistry(deckFactory, options.config ?? DEFAULT_CONFIG);

  const http = createServer();
  const io = new Server(http, { cors: { origin: corsOrigin() } });
  const sweeper = setInterval(() => rooms.sweep(roomTtlMs), sweepIntervalMs);
  sweeper.unref?.();

  io.on("connection", (socket) => {
    let myRoom: string | null = null;
    let myId: PlayerId | null = null;

    socket.on("create_room", () => {
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
      if (myRoom !== null && rooms.get(myRoom)) {
        socket.emit("error_msg", { message: "已在房间中" });
        return;
      }
      if (!isRecord(data) || typeof data.roomCode !== "string") {
        socket.emit("error_msg", { message: "请求无效" });
        return;
      }
      const session = rooms.get(data.roomCode);
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
      myRoom = data.roomCode;
      myId = "p2";
      socket.join(data.roomCode);
      socket.emit("room_joined", {
        roomCode: data.roomCode,
        sessionToken: token,
      });
      session.start();
      broadcastViews(io, session);
    });

    socket.on("poker_action", (data: unknown) => {
      if (!myRoom || !myId) return;
      const action = parseAction(data);
      if (!action) {
        socket.emit("error_msg", { message: "请求无效" });
        return;
      }
      const session = rooms.get(myRoom);
      if (!session) return;
      try {
        session.dispatch(myId, action);
        broadcastViews(io, session);
      } catch (error) {
        socket.emit("error_msg", { message: (error as Error).message });
      }
    });

    socket.on("next_hand", () => {
      if (!myRoom || !myId) return;
      const session = rooms.get(myRoom);
      if (!session) return;
      const bothConnected =
        session.isFull() &&
        !!session.players.p1?.socketId &&
        !!session.players.p2?.socketId;
      if (!bothConnected) {
        socket.emit("error_msg", { message: "对手已离开，无法开下一手" });
        return;
      }
      try {
        session.nextHand();
        broadcastViews(io, session);
      } catch (error) {
        socket.emit("error_msg", { message: (error as Error).message });
      }
    });

    socket.on("restart_match", () => {
      if (!myRoom || !myId) return;
      const session = rooms.get(myRoom);
      if (!session) return;
      const bothConnected =
        session.isFull() &&
        !!session.players.p1?.socketId &&
        !!session.players.p2?.socketId;
      if (!bothConnected) {
        socket.emit("error_msg", { message: "对手已离开，无法重开牌局" });
        return;
      }
      try {
        session.restartMatch();
        broadcastViews(io, session);
      } catch (error) {
        socket.emit("error_msg", { message: (error as Error).message });
      }
    });

    socket.on("update_settings", (data: unknown) => {
      if (!myRoom || !myId) return;
      const settings = parseSettings(data);
      if (!settings) {
        socket.emit("error_msg", { message: "请求无效" });
        return;
      }
      const session = rooms.get(myRoom);
      if (!session) return;
      session.updateSettings(settings);
      broadcastViews(io, session);
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
      const session = rooms.get(data.roomCode);
      if (!session) {
        socket.emit("error_msg", { message: "房间不存在" });
        return;
      }
      const entry = PLAYER_IDS.map((id) => session.players[id]).find(
        (player) => player?.sessionToken === data.sessionToken,
      );
      if (!entry) {
        socket.emit("error_msg", { message: "会话无效" });
        return;
      }
      session.markConnected(entry.id, socket.id);
      myRoom = data.roomCode;
      myId = entry.id;
      socket.join(data.roomCode);
      if (!session.state) {
        socket.emit("room_created", {
          roomCode: data.roomCode,
          sessionToken: data.sessionToken,
        });
        return;
      }
      const view = session.viewFor(entry.id);
      if (view) socket.emit("view_update", view);
      socket.to(data.roomCode).emit("opponent_reconnected");
    });

    socket.on("leave_room", () => {
      if (!myRoom || !myId) return;
      const session = rooms.get(myRoom);
      if (session?.state && session.state.phase !== "finished") {
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
    close: async () => {
      clearInterval(sweeper);
      await io.close();
    },
  };
}

if (process.argv[1]?.endsWith("index.ts")) {
  startServer(Number(process.env.PORT) || 3001).then(({ port }) =>
    console.log(`texas-poker server on :${port}`),
  );
}
