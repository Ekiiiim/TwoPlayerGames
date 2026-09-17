import { io, type Socket } from "socket.io-client";
import { writable, type Writable } from "svelte/store";
import type { ErrorMsg, RoomAccepted } from "@tpg/protocol";
import type { EndedCode, StatusCode } from "./dict";

/** 只要 localStorage 的这三个方法,测试里给个 Map 就够。 */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface RoomSessionOptions<V> {
  /**
   * localStorage key 前缀,拼成 `${prefix}_token` 和 `${prefix}_room`。
   * 必须沿用各游戏现有值:bw / fm / add2fifty / texas_poker。
   */
  storagePrefix: string;
  /** 每条 view_update 落进 view store 之后调用,做各游戏自己的副作用。 */
  onView?: (view: V) => void;
  /** leaveRoom 时清理各游戏自己的 store。 */
  onLeave?: () => void;
  /** 测试注入假 socket。生产不传,走同源 io()。 */
  socket?: Socket;
  /** 测试注入假 storage。生产不传,走 localStorage。 */
  storage?: StorageLike;
}

export interface RoomSession<V> {
  /** 游戏自己的事件(bw 的 game_over)往上挂。 */
  socket: Socket;
  view: Writable<V | null>;
  roomCode: Writable<string | null>;
  status: Writable<StatusCode | null>;
  ended: Writable<EndedCode | null>;
  createRoom(): void;
  joinRoom(code: string): void;
  tryRejoin(): void;
  leaveRoom(): void;
  emit(event: string, payload?: unknown): void;
}

/**
 * 会话层管线:建房 / 加入 / 重连 / 离开,以及四个 store。
 * 返回的函数全是闭包,一个 this 都不碰 —— 各游戏会把它们解构出去
 * 单独导出(`export const { tryRejoin } = session`),带 this 的话会断。
 */
export function createRoomSession<V extends { phase: string }>(
  opts: RoomSessionOptions<V>,
): RoomSession<V> {
  const socket = opts.socket ?? io({ autoConnect: true });
  // ?? 是短路的,所以 opts.storage 给了值时右边不会被求值 ——
  // node 里没有 localStorage 这个全局,求值会 ReferenceError。
  const storage = opts.storage ?? localStorage;
  const tokenKey = `${opts.storagePrefix}_token`;
  const roomKey = `${opts.storagePrefix}_room`;

  const view = writable<V | null>(null);
  const roomCode = writable<string | null>(null);
  const status = writable<StatusCode | null>(null);
  const ended = writable<EndedCode | null>(null);

  // 自动 rejoin 进行中。用来区分「静默重连失败(存档过期)」和玩家真的
  // 操作错了:前者要悄悄丢掉死会话、给一个干净的大厅,不该拿报错吓人。
  let rejoining = false;

  function clearStored(): void {
    storage.removeItem(tokenKey);
    storage.removeItem(roomKey);
  }

  function onRoomAccepted(d: RoomAccepted): void {
    rejoining = false;
    status.set(null);
    roomCode.set(d.roomCode);
    storage.setItem(tokenKey, d.sessionToken);
    storage.setItem(roomKey, d.roomCode);
  }

  socket.on("room_created", onRoomAccepted);
  socket.on("room_joined", onRoomAccepted);

  socket.on("view_update", (next: V) => {
    rejoining = false;
    // 新视图说明我这边一切正常,清掉上一条操作报错。OPPONENT_DISCONNECTED
    // 例外 —— 它说的是对手,要留到 opponent_reconnected。对手不在时视图照样
    // 会来(我还能继续出牌,flip-math 的计时器也会自己推进),一起清掉就等于
    // 横幅只活一帧。
    status.update((s) => (s === "OPPONENT_DISCONNECTED" ? s : null));
    view.set(next);
    if (next.phase !== "finished") ended.set(null);
    opts.onView?.(next);
  });

  socket.on("error_msg", (e: ErrorMsg) => {
    if (rejoining) {
      rejoining = false;
      clearStored();
      roomCode.set(null);
      status.set(null);
      return;
    }
    status.set(e.code);
  });

  socket.on("opponent_disconnected", () => status.set("OPPONENT_DISCONNECTED"));
  socket.on("opponent_reconnected", () => status.set(null));
  socket.on("opponent_left", () => ended.set("OPPONENT_LEFT"));

  /** 不带载荷时不发第二个参数,线上字节和抽取前一致。 */
  function emit(event: string, payload?: unknown): void {
    if (payload === undefined) socket.emit(event);
    else socket.emit(event, payload);
  }

  function createRoom(): void {
    emit("create_room");
  }

  function joinRoom(code: string): void {
    emit("join_room", { roomCode: code.trim().toUpperCase() });
  }

  function tryRejoin(): void {
    const token = storage.getItem(tokenKey);
    const room = storage.getItem(roomKey);
    if (!token || !room) return;
    rejoining = true;
    emit("rejoin", { roomCode: room, sessionToken: token });
  }

  function leaveRoom(): void {
    emit("leave_room");
    clearStored();
    view.set(null);
    roomCode.set(null);
    ended.set(null);
    status.set(null);
    opts.onLeave?.();
  }

  return {
    socket,
    view,
    roomCode,
    status,
    ended,
    createRoom,
    joinRoom,
    tryRejoin,
    leaveRoom,
    emit,
  };
}
