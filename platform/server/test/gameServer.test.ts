import { afterEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type { PlayerId } from "@tpg/protocol";
import { PresenceSession } from "../src/presenceSession";
import { corsOrigin, createGameServer } from "../src/gameServer";

// 最小假游戏:状态就是一个计数器和当前该谁动。够用来验证会话层管线,
// 又不把任何真游戏的规则带进 platform 的测试。
interface CounterState {
  total: number;
  turn: PlayerId;
  done: boolean;
}

class CounterSession extends PresenceSession<CounterState, unknown> {
  start(): void {
    this.state = { total: 0, turn: "p1", done: false };
  }

  add(player: PlayerId, n: number): void {
    if (!this.state) throw new Error("not started");
    if (this.state.done) throw new Error("finished");
    if (this.state.turn !== player) throw new Error("not your turn");
    if (n < 1 || n > 3) throw new Error("out of range");
    const total = this.state.total + n;
    this.state = {
      total,
      turn: player === "p1" ? "p2" : "p1",
      done: total >= 10,
    };
  }

  viewFor(id: PlayerId): unknown {
    if (!this.state) return null;
    // 裁剪:每个玩家只看到「是不是我的回合」,看不到对手 id。
    return {
      total: this.state.total,
      myTurn: this.state.turn === id,
      done: this.state.done,
    };
  }
}

function counterServer(
  overrides: { roomTtlMs?: number; sweepIntervalMs?: number } = {},
) {
  return createGameServer<CounterSession>({
    createSession: () => new CounterSession(),
    onStart: (ctx) => {
      ctx.session.start();
      ctx.broadcastViews();
    },
    isInProgress: (s) => s.state !== null && !s.state.done,
    actions: {
      add: (ctx, data) => {
        if (!data || typeof (data as { n?: unknown }).n !== "number") {
          ctx.fail("INVALID_REQUEST");
          return;
        }
        try {
          ctx.session.add(ctx.playerId, (data as { n: number }).n);
        } catch {
          ctx.fail("INVALID_MOVE");
          return;
        }
        ctx.broadcastViews();
      },
      restart: {
        requireBothConnected: true,
        handler: (ctx) => {
          ctx.session.start();
          ctx.broadcastViews();
        },
      },
    },
    ...overrides,
  });
}

const sockets: ClientSocket[] = [];
function connect(port: number): ClientSocket {
  const s = ioClient(`http://localhost:${port}`, { transports: ["websocket"] });
  sockets.push(s);
  return s;
}
function once<T>(s: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) =>
    s.once(event, resolve as (v: unknown) => void),
  );
}

afterEach(() => {
  for (const s of sockets.splice(0)) s.disconnect();
});

describe("createGameServer 的会话层管线", () => {
  it("建房、加入、开局,双方各收到自己的视图", async () => {
    const { port, close } = await counterServer()(0);
    const a = connect(port);
    const b = connect(port);

    a.emit("create_room");
    const created = await once<{ roomCode: string; sessionToken: string }>(
      a,
      "room_created",
    );
    expect(created.roomCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(created.sessionToken).toMatch(/^[0-9a-f]{32}$/);

    const aView = once<{ myTurn: boolean }>(a, "view_update");
    const bView = once<{ myTurn: boolean }>(b, "view_update");
    b.emit("join_room", { roomCode: created.roomCode });
    await once(b, "room_joined");

    // p1 先动:两边看到的 myTurn 相反 —— 视图是按玩家裁剪的
    expect((await aView).myTurn).toBe(true);
    expect((await bView).myTurn).toBe(false);
    await close();
  });

  it("动作走服务器判定,轮次不对被拒", async () => {
    const { port, close } = await counterServer()(0);
    const a = connect(port);
    const b = connect(port);
    a.emit("create_room");
    const { roomCode } = await once<{ roomCode: string }>(a, "room_created");
    b.emit("join_room", { roomCode });
    await once(b, "view_update");

    // 现在是 p1 的回合,p2 抢动 -> INVALID_MOVE
    const err = once<{ code: string }>(b, "error_msg");
    b.emit("add", { n: 2 });
    expect((await err).code).toBe("INVALID_MOVE");

    // p1 正常动
    const v = once<{ total: number }>(a, "view_update");
    a.emit("add", { n: 2 });
    expect((await v).total).toBe(2);
    await close();
  });

  it("越界的动作值被服务器拒掉,状态不动", async () => {
    const { port, close } = await counterServer()(0);
    const a = connect(port);
    const b = connect(port);
    a.emit("create_room");
    const { roomCode } = await once<{ roomCode: string }>(a, "room_created");
    b.emit("join_room", { roomCode });
    await once(a, "view_update");

    const err = once<{ code: string }>(a, "error_msg");
    a.emit("add", { n: 99 }); // 规则只允许 1..3
    expect((await err).code).toBe("INVALID_MOVE");

    const v = once<{ total: number }>(a, "view_update");
    a.emit("add", { n: 1 });
    expect((await v).total).toBe(1); // 99 没有生效
    await close();
  });

  it("载荷形状不对回 INVALID_REQUEST", async () => {
    const { port, close } = await counterServer()(0);
    const a = connect(port);
    const b = connect(port);
    a.emit("create_room");
    const { roomCode } = await once<{ roomCode: string }>(a, "room_created");
    b.emit("join_room", { roomCode });
    await once(a, "view_update");

    const err = once<{ code: string }>(a, "error_msg");
    a.emit("add", { n: "three" });
    expect((await err).code).toBe("INVALID_REQUEST");
    await close();
  });

  it("加入不存在的房间回 ROOM_NOT_FOUND", async () => {
    const { port, close } = await counterServer()(0);
    const a = connect(port);
    const err = once<{ code: string }>(a, "error_msg");
    a.emit("join_room", { roomCode: "ZZZZZZ" });
    expect((await err).code).toBe("ROOM_NOT_FOUND");
    await close();
  });

  it("第三个人加入满房回 ROOM_FULL", async () => {
    const { port, close } = await counterServer()(0);
    const a = connect(port);
    const b = connect(port);
    const c = connect(port);
    a.emit("create_room");
    const { roomCode } = await once<{ roomCode: string }>(a, "room_created");
    b.emit("join_room", { roomCode });
    await once(b, "room_joined");

    const err = once<{ code: string }>(c, "error_msg");
    c.emit("join_room", { roomCode });
    expect((await err).code).toBe("ROOM_FULL");
    await close();
  });

  it("同一个 socket 重复建房回 ALREADY_IN_ROOM", async () => {
    const { port, close } = await counterServer()(0);
    const a = connect(port);
    a.emit("create_room");
    await once(a, "room_created");
    const err = once<{ code: string }>(a, "error_msg");
    a.emit("create_room");
    expect((await err).code).toBe("ALREADY_IN_ROOM");
    await close();
  });

  it("伪造的 sessionToken rejoin 被拒", async () => {
    const { port, close } = await counterServer()(0);
    const a = connect(port);
    a.emit("create_room");
    const { roomCode } = await once<{ roomCode: string }>(a, "room_created");

    const c = connect(port);
    const err = once<{ code: string }>(c, "error_msg");
    c.emit("rejoin", { roomCode, sessionToken: "f".repeat(32) });
    expect((await err).code).toBe("INVALID_SESSION");
    await close();
  });

  it("带正确 token 的 rejoin 恢复到当前视图", async () => {
    const { port, close } = await counterServer()(0);
    const a = connect(port);
    const b = connect(port);
    a.emit("create_room");
    const created = await once<{ roomCode: string; sessionToken: string }>(
      a,
      "room_created",
    );
    // 先等两边都收到首个视图,再监听下一个 —— 否则 b 的首个视图还在路上时,
    // 下面那个 once 会被它 resolve,动作其实还没被服务器处理。
    const aInit = once(a, "view_update");
    const bInit = once(b, "view_update");
    b.emit("join_room", { roomCode: created.roomCode });
    await Promise.all([aInit, bInit]);

    const moved = once<{ total: number }>(b, "view_update");
    a.emit("add", { n: 3 });
    expect((await moved).total).toBe(3);

    a.disconnect();
    const a2 = connect(port);
    const restored = once<{ total: number }>(a2, "view_update");
    a2.emit("rejoin", {
      roomCode: created.roomCode,
      sessionToken: created.sessionToken,
    });
    expect((await restored).total).toBe(3);
    await close();
  });

  it("局中 rejoin 先回 room_joined 带房间码,再推视图", async () => {
    const { port, close } = await counterServer()(0);
    const a = connect(port);
    const b = connect(port);
    a.emit("create_room");
    const created = await once<{ roomCode: string; sessionToken: string }>(
      a,
      "room_created",
    );
    const aInit = once(a, "view_update");
    b.emit("join_room", { roomCode: created.roomCode });
    await aInit;
    a.disconnect();

    // 刷新后的页面只有 localStorage 里的 token,房间码 store 是空的;
    // 服务器不回房间码,局中显示房间码的地方就一直空着。
    const a2 = connect(port);
    const events: string[] = [];
    a2.onAny((event: string) => events.push(event));
    const accepted = once<{ roomCode: string; sessionToken: string }>(
      a2,
      "room_joined",
    );
    const restored = once(a2, "view_update");
    a2.emit("rejoin", created);
    expect(await accepted).toEqual(created);
    await restored;
    expect(events.slice(0, 2)).toEqual(["room_joined", "view_update"]);
    await close();
  });

  it("还没开局时 rejoin 回到等待室而不是报错", async () => {
    const { port, close } = await counterServer()(0);
    const a = connect(port);
    a.emit("create_room");
    const created = await once<{ roomCode: string; sessionToken: string }>(
      a,
      "room_created",
    );
    a.disconnect();

    const a2 = connect(port);
    const back = once<{ roomCode: string }>(a2, "room_created");
    a2.emit("rejoin", created);
    expect((await back).roomCode).toBe(created.roomCode);
    await close();
  });

  it("对手掉线与重连都通知另一方", async () => {
    const { port, close } = await counterServer()(0);
    const a = connect(port);
    const b = connect(port);
    a.emit("create_room");
    const created = await once<{ roomCode: string; sessionToken: string }>(
      a,
      "room_created",
    );
    b.emit("join_room", { roomCode: created.roomCode });
    await once(b, "view_update");

    const gone = once(b, "opponent_disconnected");
    a.disconnect();
    await gone;

    const backAgain = once(b, "opponent_reconnected");
    const a2 = connect(port);
    a2.emit("rejoin", created);
    await backAgain;
    await close();
  });

  it("局中离开,对手收到 opponent_left", async () => {
    const { port, close } = await counterServer()(0);
    const a = connect(port);
    const b = connect(port);
    a.emit("create_room");
    const { roomCode } = await once<{ roomCode: string }>(a, "room_created");
    b.emit("join_room", { roomCode });
    await once(b, "view_update");

    const left = once(b, "opponent_left");
    a.emit("leave_room");
    await left;
    await close();
  });

  it("requireBothConnected 的动作在对手掉线时回 OPPONENT_GONE", async () => {
    const { port, close } = await counterServer()(0);
    const a = connect(port);
    const b = connect(port);
    a.emit("create_room");
    const { roomCode } = await once<{ roomCode: string }>(a, "room_created");
    b.emit("join_room", { roomCode });
    await once(a, "view_update");

    const gone = once(a, "opponent_disconnected");
    b.disconnect();
    await gone;

    const err = once<{ code: string }>(a, "error_msg");
    a.emit("restart");
    expect((await err).code).toBe("OPPONENT_GONE");
    await close();
  });

  it("双方都在线时 requireBothConnected 的动作正常执行", async () => {
    const { port, close } = await counterServer()(0);
    const a = connect(port);
    const b = connect(port);
    a.emit("create_room");
    const { roomCode } = await once<{ roomCode: string }>(a, "room_created");
    b.emit("join_room", { roomCode });
    await once(a, "view_update");

    const moved = once<{ total: number }>(a, "view_update");
    a.emit("add", { n: 3 });
    expect((await moved).total).toBe(3);

    const reset = once<{ total: number }>(a, "view_update");
    a.emit("restart");
    expect((await reset).total).toBe(0);
    await close();
  });

  it("没进房间就发动作,服务器静默忽略", async () => {
    const { port, close } = await counterServer()(0);
    const a = connect(port);
    let got = false;
    a.on("error_msg", () => (got = true));
    a.on("view_update", () => (got = true));
    a.emit("add", { n: 1 });
    await new Promise((r) => setTimeout(r, 120));
    expect(got).toBe(false);
    await close();
  });

  it("空置房间被定时扫走", async () => {
    const { port, close } = await counterServer({
      roomTtlMs: 10,
      sweepIntervalMs: 20,
    })(0);
    const a = connect(port);
    a.emit("create_room");
    const created = await once<{ roomCode: string; sessionToken: string }>(
      a,
      "room_created",
    );
    a.disconnect();
    await new Promise((r) => setTimeout(r, 120));

    const a2 = connect(port);
    const err = once<{ code: string }>(a2, "error_msg");
    a2.emit("rejoin", created);
    expect((await err).code).toBe("ROOM_NOT_FOUND");
    await close();
  });
});

describe("corsOrigin", () => {
  const saved = { origin: process.env.CORS_ORIGIN, env: process.env.NODE_ENV };
  afterEach(() => {
    process.env.CORS_ORIGIN = saved.origin;
    process.env.NODE_ENV = saved.env;
  });

  it("生产环境默认关掉跨源 —— 客户端由 Caddy 同源服务", () => {
    delete process.env.CORS_ORIGIN;
    process.env.NODE_ENV = "production";
    expect(corsOrigin()).toBe(false);
  });

  it("非生产环境放开,方便本地起两个端口", () => {
    delete process.env.CORS_ORIGIN;
    process.env.NODE_ENV = "development";
    expect(corsOrigin()).toBe("*");
  });

  it("CORS_ORIGIN 覆盖两种情况,逗号分隔并去空格", () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGIN = "https://a.example , https://b.example";
    expect(corsOrigin()).toEqual(["https://a.example", "https://b.example"]);
  });
});
