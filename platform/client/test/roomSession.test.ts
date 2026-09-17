import { beforeEach, describe, expect, it } from "vitest";
import { get } from "svelte/store";
import type { Socket } from "socket.io-client";
import { createRoomSession, type StorageLike } from "../src/roomSession";

/**
 * 假 socket。createRoomSession 只用到 on / emit,但它的参数类型标的是真
 * Socket —— 想写一个真 Socket 也能满足的结构化 SocketLike,在
 * strictFunctionTypes 下很容易崩,不如在测试里 cast 一次。
 */
class FakeSocket {
  handlers = new Map<string, ((payload?: unknown) => void)[]>();
  sent: { event: string; args: unknown[] }[] = [];

  on(event: string, handler: (payload?: unknown) => void): this {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }

  emit(event: string, ...args: unknown[]): this {
    this.sent.push({ event, args });
    return this;
  }

  /** 模拟服务器推一个事件。 */
  fire(event: string, payload?: unknown): void {
    for (const h of this.handlers.get(event) ?? []) h(payload);
  }

  lastSent(): { event: string; args: unknown[] } | undefined {
    return this.sent[this.sent.length - 1];
  }
}

class FakeStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

interface TestView {
  phase: string;
  n: number;
}

let socket: FakeSocket;
let storage: FakeStorage;

function make(
  opts: Partial<Parameters<typeof createRoomSession<TestView>>[0]> = {},
) {
  return createRoomSession<TestView>({
    storagePrefix: "bw",
    socket: socket as unknown as Socket,
    storage,
    ...opts,
  });
}

beforeEach(() => {
  socket = new FakeSocket();
  storage = new FakeStorage();
});

describe("建房与加入", () => {
  it("room_created 存下会话并把房间码推进 store", () => {
    const s = make();
    socket.fire("room_created", { roomCode: "ABC123", sessionToken: "tok" });
    expect(get(s.roomCode)).toBe("ABC123");
    expect(storage.getItem("bw_token")).toBe("tok");
    expect(storage.getItem("bw_room")).toBe("ABC123");
  });

  it("room_joined 走同一条路径", () => {
    const s = make();
    socket.fire("room_joined", { roomCode: "XYZ789", sessionToken: "t2" });
    expect(get(s.roomCode)).toBe("XYZ789");
    expect(storage.getItem("bw_token")).toBe("t2");
  });

  it("storagePrefix 决定 key 名", () => {
    // 前缀是上线安全的硬约束:改了它,玩家浏览器里存着的 token 就对不上,
    // 正在打的局全被踢回大厅。
    make({ storagePrefix: "add2fifty" });
    socket.fire("room_created", { roomCode: "AAA111", sessionToken: "t" });
    expect(storage.getItem("add2fifty_token")).toBe("t");
    expect(storage.getItem("add2fifty_room")).toBe("AAA111");
    expect(storage.getItem("bw_token")).toBeNull();
  });

  it("createRoom 发一个不带载荷的 create_room", () => {
    make().createRoom();
    expect(socket.lastSent()).toEqual({ event: "create_room", args: [] });
  });

  it("joinRoom 把房间码 trim 并转大写", () => {
    make().joinRoom("  abc123 ");
    expect(socket.lastSent()).toEqual({
      event: "join_room",
      args: [{ roomCode: "ABC123" }],
    });
  });
});

describe("view_update", () => {
  it("落进 view store 并调 onView", () => {
    const seen: TestView[] = [];
    const s = make({ onView: (v) => seen.push(v) });
    socket.fire("view_update", { phase: "playing", n: 1 });
    expect(get(s.view)).toEqual({ phase: "playing", n: 1 });
    expect(seen).toEqual([{ phase: "playing", n: 1 }]);
  });

  it("清掉上一条操作报错", () => {
    const s = make();
    socket.fire("error_msg", { code: "INVALID_MOVE" });
    expect(get(s.status)).toBe("INVALID_MOVE");
    socket.fire("view_update", { phase: "playing", n: 1 });
    expect(get(s.status)).toBeNull();
  });

  it("保留 OPPONENT_DISCONNECTED", () => {
    // 这一条说的是对手,不是我的操作报错。flip-math 的状态由计时器推进,
    // 每次转移都发视图 —— 一起清掉的话对手一掉线横幅立刻就没了。
    const s = make();
    socket.fire("opponent_disconnected");
    socket.fire("view_update", { phase: "playing", n: 1 });
    expect(get(s.status)).toBe("OPPONENT_DISCONNECTED");
  });

  it("非 finished 的视图清掉 ended", () => {
    const s = make();
    socket.fire("opponent_left");
    expect(get(s.ended)).toBe("OPPONENT_LEFT");
    socket.fire("view_update", { phase: "waiting", n: 0 });
    expect(get(s.ended)).toBeNull();
  });

  it("finished 的视图不清 ended", () => {
    const s = make();
    socket.fire("opponent_left");
    socket.fire("view_update", { phase: "finished", n: 9 });
    expect(get(s.ended)).toBe("OPPONENT_LEFT");
  });
});

describe("对手的连接状态", () => {
  it("opponent_disconnected 置上横幅", () => {
    const s = make();
    socket.fire("opponent_disconnected");
    expect(get(s.status)).toBe("OPPONENT_DISCONNECTED");
  });

  it("opponent_reconnected 才清掉它", () => {
    const s = make();
    socket.fire("opponent_disconnected");
    socket.fire("opponent_reconnected");
    expect(get(s.status)).toBeNull();
  });
});

describe("rejoin", () => {
  it("没有存档时不发包", () => {
    make().tryRejoin();
    expect(socket.sent).toEqual([]);
  });

  it("有存档时带上房间码和 token", () => {
    storage.setItem("bw_room", "ABC123");
    storage.setItem("bw_token", "tok");
    make().tryRejoin();
    expect(socket.lastSent()).toEqual({
      event: "rejoin",
      args: [{ roomCode: "ABC123", sessionToken: "tok" }],
    });
  });

  it("静默失败会丢掉死会话且不显示报错", () => {
    // localStorage 里的会话过期了(房间没了 / 服务器重启过)。不该拿
    // ROOM_NOT_FOUND 吓玩家,该悄悄丢掉存档、给他一个干净的大厅。
    storage.setItem("bw_room", "ABC123");
    storage.setItem("bw_token", "tok");
    const s = make();
    s.tryRejoin();
    socket.fire("error_msg", { code: "ROOM_NOT_FOUND" });
    expect(get(s.status)).toBeNull();
    expect(get(s.roomCode)).toBeNull();
    expect(storage.getItem("bw_token")).toBeNull();
    expect(storage.getItem("bw_room")).toBeNull();
  });

  it("非 rejoin 期间的 error_msg 照常显示", () => {
    const s = make();
    socket.fire("error_msg", { code: "ROOM_FULL" });
    expect(get(s.status)).toBe("ROOM_FULL");
    expect(storage.getItem("bw_token")).toBeNull();
  });

  it("rejoin 成功之后的 error_msg 不再被当成静默失败", () => {
    storage.setItem("bw_room", "ABC123");
    storage.setItem("bw_token", "tok");
    const s = make();
    s.tryRejoin();
    socket.fire("view_update", { phase: "playing", n: 1 }); // rejoin 成功
    socket.fire("error_msg", { code: "INVALID_MOVE" });
    expect(get(s.status)).toBe("INVALID_MOVE");
    expect(storage.getItem("bw_token")).toBe("tok");
  });
});

describe("leaveRoom", () => {
  it("清空四个 store、清掉存档、调 onLeave", () => {
    let left = 0;
    const s = make({ onLeave: () => (left += 1) });
    socket.fire("room_created", { roomCode: "ABC123", sessionToken: "tok" });
    socket.fire("view_update", { phase: "playing", n: 1 });
    socket.fire("error_msg", { code: "INVALID_MOVE" });
    socket.fire("opponent_left");

    s.leaveRoom();

    expect(socket.lastSent()).toEqual({ event: "leave_room", args: [] });
    expect(get(s.view)).toBeNull();
    expect(get(s.roomCode)).toBeNull();
    expect(get(s.status)).toBeNull();
    expect(get(s.ended)).toBeNull();
    expect(storage.getItem("bw_token")).toBeNull();
    expect(storage.getItem("bw_room")).toBeNull();
    expect(left).toBe(1);
  });
});

describe("emit", () => {
  it("带载荷的动作照发", () => {
    make().emit("play_card", { card: 3 });
    expect(socket.lastSent()).toEqual({
      event: "play_card",
      args: [{ card: 3 }],
    });
  });

  it("不带载荷的动作不多发一个 undefined", () => {
    // socket.io 会把 undefined 序列化成 null 发过去。服务器那边
    // buzz / ready / rematch 不看载荷,但保持线上字节和原来一样更省心。
    make().emit("buzz");
    expect(socket.lastSent()).toEqual({ event: "buzz", args: [] });
  });
});
