import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { PLAYER_IDS, type ErrorCode, type PlayerId } from "@tpg/protocol";
import type { PresenceSession } from "./presenceSession";
import { RoomRegistry, makeToken } from "./rooms";

/** 未信任 socket 载荷的收窄 guard,省掉散落各处的 as any。 */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * 生产环境客户端由 Caddy 同源服务,不需要 CORS(origin: false);开发环境放开。
 * CORS_ORIGIN(逗号分隔)两种情况都能覆盖。
 */
export function corsOrigin(): string | string[] | boolean {
  const env = process.env.CORS_ORIGIN?.trim();
  if (env) return env.split(",").map((s) => s.trim());
  return process.env.NODE_ENV === "production" ? false : "*";
}

export interface ActionCtx<S> {
  session: S;
  playerId: PlayerId;
  socket: Socket;
  /** 给房内每个在线玩家发自己那份 view_update。 */
  broadcastViews(): void;
  /** 按玩家裁剪的自定义广播;make 返回 null 表示这个玩家不发。 */
  broadcastPerPlayer<T>(event: string, make: (id: PlayerId) => T | null): void;
  fail(code: ErrorCode): void;
}

export type ActionHandler<S> = (ctx: ActionCtx<S>, data: unknown) => void;

export interface ActionDef<S> {
  /**
   * 要求双方都在线,否则回 OPPONENT_GONE。
   * 「重开一局」这类动作(rematch / next_hand / restart_match)用它。
   */
  requireBothConnected?: boolean;
  handler: ActionHandler<S>;
}

export interface GameServerOptions<
  S extends PresenceSession<unknown, unknown>,
> {
  createSession(): S;
  /**
   * 第二人加入时调用。抛硬币定先手、要不要立刻广播,都由这里决定 ——
   * 框架不替你广播,因为状态由计时器驱动的游戏会自己推。
   */
  onStart(ctx: ActionCtx<S>): void;
  /** 「局还在进行中」:决定 leave_room 要不要给对手判胜。 */
  isInProgress(session: S): boolean;
  /** 游戏自己的 socket 事件。裸函数等价于 { handler }。 */
  actions: Record<string, ActionHandler<S> | ActionDef<S>>;
  /** rejoin 成功且已开局之后的额外补发。终局界面要补发的游戏用它。 */
  onRejoin?(ctx: ActionCtx<S>): void;
  /** 完全空置的房间保留多久(默认 10 分钟)。 */
  roomTtlMs?: number;
  /** 扫房间隔(默认 60 秒)。 */
  sweepIntervalMs?: number;
}

function normalize<S>(a: ActionHandler<S> | ActionDef<S>): ActionDef<S> {
  return typeof a === "function" ? { handler: a } : a;
}

export function createGameServer<S extends PresenceSession<unknown, unknown>>(
  opts: GameServerOptions<S>,
): (port: number) => Promise<{ port: number; close: () => Promise<void> }> {
  const roomTtlMs = opts.roomTtlMs ?? 10 * 60 * 1000;
  const sweepIntervalMs = opts.sweepIntervalMs ?? 60 * 1000;
  const actions = Object.fromEntries(
    Object.entries(opts.actions).map(([k, v]) => [k, normalize<S>(v)]),
  );

  return async (port: number) => {
    const http = createServer();
    const io = new Server(http, { cors: { origin: corsOrigin() } });
    const rooms = new RoomRegistry<S>(opts.createSession);

    // 定时回收双方都弃置的房间(标签页直接关掉,不会发 leave_room)。
    // unref 让这个定时器不阻止进程退出。
    const sweeper = setInterval(() => rooms.sweep(roomTtlMs), sweepIntervalMs);
    sweeper.unref?.();

    function broadcastPerPlayer<T>(
      session: S,
      event: string,
      make: (id: PlayerId) => T | null,
    ): void {
      for (const id of PLAYER_IDS) {
        const player = session.players[id];
        if (!player?.socketId) continue;
        const payload = make(id);
        if (payload !== null) io.to(player.socketId).emit(event, payload);
      }
    }

    function broadcastViews(session: S): void {
      broadcastPerPlayer(session, "view_update", (id) => session.viewFor(id));
    }

    /** 每个接入点都要装,状态由计时器驱动的游戏靠它自己推视图。 */
    function attach(session: S): void {
      session.broadcast = () => broadcastViews(session);
    }

    function makeCtx(
      session: S,
      playerId: PlayerId,
      socket: Socket,
    ): ActionCtx<S> {
      return {
        session,
        playerId,
        socket,
        broadcastViews: () => broadcastViews(session),
        broadcastPerPlayer: (event, make) =>
          broadcastPerPlayer(session, event, make),
        fail: (code) => socket.emit("error_msg", { code }),
      };
    }

    io.on("connection", (socket) => {
      let myRoom: string | null = null;
      let myId: PlayerId | null = null;

      socket.on("create_room", () => {
        // 只在房间还活着时才拦重复建房。陈旧的成员关系(房间已被销毁)不该把
        // 玩家锁死在外面 —— 放过去,让他建个新房。
        if (myRoom !== null && rooms.get(myRoom)) {
          socket.emit("error_msg", { code: "ALREADY_IN_ROOM" });
          return;
        }
        const { roomCode, session } = rooms.create();
        const token = makeToken();
        session.addPlayer("p1", socket.id, token);
        attach(session);
        myRoom = roomCode;
        myId = "p1";
        socket.join(roomCode);
        socket.emit("room_created", { roomCode, sessionToken: token });
      });

      socket.on("join_room", (data: unknown) => {
        if (myRoom !== null && rooms.get(myRoom)) {
          socket.emit("error_msg", { code: "ALREADY_IN_ROOM" });
          return;
        }
        if (!isRecord(data) || typeof data.roomCode !== "string") {
          socket.emit("error_msg", { code: "INVALID_REQUEST" });
          return;
        }
        const roomCode = data.roomCode;
        const session = rooms.get(roomCode);
        if (!session) {
          socket.emit("error_msg", { code: "ROOM_NOT_FOUND" });
          return;
        }
        if (session.isFull()) {
          socket.emit("error_msg", { code: "ROOM_FULL" });
          return;
        }
        const token = makeToken();
        session.addPlayer("p2", socket.id, token);
        attach(session);
        myRoom = roomCode;
        myId = "p2";
        socket.join(roomCode);
        socket.emit("room_joined", { roomCode, sessionToken: token });
        opts.onStart(makeCtx(session, "p2", socket));
      });

      socket.on("rejoin", (data: unknown) => {
        if (
          !isRecord(data) ||
          typeof data.roomCode !== "string" ||
          typeof data.sessionToken !== "string"
        ) {
          socket.emit("error_msg", { code: "INVALID_REQUEST" });
          return;
        }
        const roomCode = data.roomCode;
        const sessionToken = data.sessionToken;
        const session = rooms.get(roomCode);
        if (!session) {
          socket.emit("error_msg", { code: "ROOM_NOT_FOUND" });
          return;
        }
        const entry = session.findByToken(sessionToken);
        if (!entry) {
          socket.emit("error_msg", { code: "INVALID_SESSION" });
          return;
        }
        session.markConnected(entry.id, socket.id);
        attach(session);
        myRoom = roomCode;
        myId = entry.id;
        socket.join(roomCode);

        // 还没开局(房主在等对手时刷新了页面):把他放回等待室,而不是弹错误。
        if (session.state === null) {
          socket.emit("room_created", { roomCode, sessionToken });
          return;
        }
        const view = session.viewFor(entry.id);
        if (view !== null) socket.emit("view_update", view);
        opts.onRejoin?.(makeCtx(session, entry.id, socket));
        socket.to(roomCode).emit("opponent_reconnected");
      });

      for (const [event, def] of Object.entries(actions)) {
        socket.on(event, (data: unknown) => {
          if (!myRoom || !myId) return;
          const session = rooms.get(myRoom);
          if (!session) return;
          if (def.requireBothConnected && !session.bothConnected()) {
            socket.emit("error_msg", { code: "OPPONENT_GONE" });
            return;
          }
          def.handler(makeCtx(session, myId, socket), data);
        });
      }

      socket.on("leave_room", () => {
        if (!myRoom || !myId) return;
        const session = rooms.get(myRoom);
        // 只有局还在进行时才给对手判胜。局结束后离开是普通清理。
        if (session && opts.isInProgress(session)) {
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
  };
}
