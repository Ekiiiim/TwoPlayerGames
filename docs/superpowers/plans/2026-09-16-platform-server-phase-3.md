# platform/server 抽取 — 阶段 3 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把四个游戏 server 里逐字相同的连接簿记、房间注册表和五个会话层 socket
handler 抽成 `@tpg/server`，各游戏只留自己的动作 handler。

**Architecture:** `PresenceSession` 抽象基类收走连接状态（谁连着、谁掉线、空了多久），
泛型参数是各游戏自己的 state 和 view 类型。`RoomRegistry<S>` 收走房间码生成与 TTL 扫房，
靠一个工厂函数拿到各游戏的 session。`createGameServer()` 收走 http/socket.io/扫房定时器/
关闭收尾，以及 `create_room`、`join_room`、`rejoin`、`leave_room`、`disconnect` 五个
handler；游戏自己的动作通过 `actions` 传入。各游戏保留 `startServer(port, options)`
这个导出当薄壳，所以 42 个现有 server 集成测试一行不改，它们就是这次抽取的回归。

**Tech Stack:** Node 22 + tsx ｜ Socket.IO 4 ｜ TypeScript 5 ｜ Vitest 4 ｜ npm workspaces

**Spec:** `docs/superpowers/specs/2026-09-16-platform-extraction-design.md` 的阶段 3

## Global Constraints

- **npm >= 11**（本机）。npm 10.9.2 在这个依赖图上崩在 arborist 的 `#loadPeerSet`。
  Docker 里的 npm 10 不受影响，`npm ci` 不走那条代码路径。
- **Baseline**：156 个测试全过（13 个 workspace），四个 `svelte-check` 各
  0 errors 0 warnings，`prettier --check .` 通过。其中 server 的 42 个是本阶段的回归：
  black-and-white 19、flip-math 9、add-to-fifty 6、texas-poker 8。
- **四个游戏的 `packages/server/test/integration.test.ts` 一行都不许改。** 它们
  `import { startServer } from "../src/index"` 并以 `startServer(0, options)` 调用，
  所以每个游戏必须保留这个签名和这些 option 名（`deck` / `config` / `durations` /
  `firstPlayer` / `roomTtlMs` / `sweepIntervalMs`）。测试改了就等于没有回归。
- **不改玩法规则。** `packages/shared` 一行不动。
- **服务器权威性不许放松。** 抽取后仍须：伪造 sessionToken 被拒
  （`INVALID_SESSION`）、满房被拒（`ROOM_FULL`）、非法动作被拒（`INVALID_MOVE`）、
  结算只由服务器做。
- **`@tpg/server` 按源码分发**（`main: "src/index.ts"`），和 `@tpg/protocol` 一致。
- **不 `git push`。**

## 四个游戏 server 的现状测量

`packages/server/src/index.ts` 合计 991 行。逐字相同的部分：

| 部分 | 四份是否相同 | 差异 |
| --- | --- | --- |
| `isRecord` | 相同 | 变量名 `v` / `value` |
| `corsOrigin` | 相同 | 变量名 |
| `broadcastViews` | 相同 | `view !== null` / `if (view)` |
| `startServer` 骨架（http + io + sweeper + listen + close） | 相同 | 无 |
| `create_room` | 相同 | flip-math 多一句 `session.broadcast = ...` |
| `join_room` 的四道 guard | 相同 | 无 |
| `join_room` 开局之后 | 不同 | bw 抛硬币定先手 + 广播；a2f/tp `start()` + 广播；fm `start()` 自己广播 |
| `rejoin` | 相同 | bw 多补一次 `game_over`；fm 多一句 `session.broadcast = ...` |
| `leave_room` | 相同 | 「进行中」判据：bw 是 `phase === "playing"`，其余是 `phase !== "finished"` |
| `disconnect` | 相同 | 无 |
| 重开一局 | 结构相同 | bw/fm/a2f 是 `rematch`；tp 是 `next_hand` + `restart_match`。三者都先查双方在线、否则回 `OPPONENT_GONE` |

`packages/server/src/gameSession.ts` 合计 348 行，其中连接簿记那 6 个方法
（`addPlayer`、`isFull`、`anyConnected`、`markConnected`、`markDisconnected`、
`isSweepable`）四份除格式无差别。

两处只出现在 index.ts 里、但本质属于 session 的表达式，一并提上来：
按 token 找玩家（`rejoin` 里的 `PLAYER_IDS.map(...).find(...)`，四份相同）和
判双方在线（重开一局的 guard，四份相同）。

`packages/server/src/rooms.ts` 合计 211 行，唯一差异是怎么 new 出 `GameSession`，
外加 flip-math 在 `delete`/`sweep` 时多一句 `clearTimer()`。

## File Structure

| 文件 | 责任 |
| --- | --- |
| `platform/server/package.json` | 包声明，依赖 `@tpg/protocol` 与 `socket.io` |
| `platform/server/tsconfig.json` | 编译配置，`lib` 不含 DOM |
| `platform/server/src/presenceSession.ts` | `Player`、`PresenceSession` 抽象基类 |
| `platform/server/src/rooms.ts` | `makeRoomCode`、`makeToken`、`RoomRegistry<S>` |
| `platform/server/src/gameServer.ts` | `createGameServer`、`ActionCtx`、`isRecord`、`corsOrigin` |
| `platform/server/src/index.ts` | barrel |
| `platform/server/test/presenceSession.test.ts` | 连接簿记的单元测试 |
| `platform/server/test/rooms.test.ts` | 房间码、token、TTL 扫房、`onDispose` |
| `platform/server/test/gameServer.test.ts` | 最小假游戏跑完整流程 + 权威性回归 |
| `<game>/packages/server/src/gameSession.ts` × 4 | 删连接簿记，改成 `extends PresenceSession` |
| `<game>/packages/server/src/rooms.ts` × 4 | **删除**，改从 `@tpg/server` 取 |
| `<game>/packages/server/src/index.ts` × 4 | 只留 `startServer` 薄壳 + 自己的动作 handler |
| `<game>/packages/server/package.json` × 4 | 加 `@tpg/server` 依赖 |

---

## Task 1: platform/server 的 PresenceSession 与 RoomRegistry

**Files:**
- Create: `platform/server/package.json`
- Create: `platform/server/tsconfig.json`
- Create: `platform/server/src/presenceSession.ts`
- Create: `platform/server/src/rooms.ts`
- Create: `platform/server/src/index.ts`
- Test: `platform/server/test/presenceSession.test.ts`
- Test: `platform/server/test/rooms.test.ts`

**Interfaces:**
- Consumes: `@tpg/protocol` 的 `PLAYER_IDS`、`PlayerId`
- Produces:
  - `Player`：`{ id: PlayerId; socketId: string | null; sessionToken: string }`
  - `abstract class PresenceSession<S, V>`，字段 `state: S | null`、
    `players: Partial<Record<PlayerId, Player>>`、`emptySince: number | null`、
    `broadcast: (() => void) | null`；方法
    `addPlayer(id, socketId, sessionToken): void`、`isFull(): boolean`、
    `anyConnected(): boolean`、`bothConnected(): boolean`、
    `findByToken(token): Player | undefined`、`markConnected(id, socketId): void`、
    `markDisconnected(id, now?): void`、`isSweepable(ttlMs, now?): boolean`；
    抽象 `viewFor(id: PlayerId): V | null`；可选 `onDispose?(): void`
  - `makeRoomCode(): string`、`makeToken(): string`
  - `class RoomRegistry<S extends Sweepable>`，构造参数 `createSession: () => S`；
    方法 `create(): { roomCode: string; session: S }`、`get(code): S | undefined`、
    `delete(code): void`、`sweep(ttlMs, now?): string[]`

  Task 2 的 `createGameServer` 和 Task 3–6 的各游戏 `GameSession` 都用这些名字。

- [x] **Step 1: 写 PresenceSession 的失败测试**

Create `platform/server/test/presenceSession.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { PresenceSession } from "../src/presenceSession";
import type { PlayerId } from "@tpg/protocol";

// 最小实现:连接簿记不关心 state 和 view 的形状,测试也不需要真玩法。
class FakeSession extends PresenceSession<{ n: number }, { n: number }> {
  viewFor(): { n: number } | null {
    return this.state;
  }
}

describe("PresenceSession 的连接簿记", () => {
  it("addPlayer 之后房间不再算空置", () => {
    const s = new FakeSession();
    expect(s.emptySince).toBeNull();
    s.addPlayer("p1", "sock1", "tok1");
    expect(s.players.p1).toEqual({
      id: "p1",
      socketId: "sock1",
      sessionToken: "tok1",
    });
    expect(s.emptySince).toBeNull();
  });

  it("两人到齐才算满", () => {
    const s = new FakeSession();
    expect(s.isFull()).toBe(false);
    s.addPlayer("p1", "sock1", "tok1");
    expect(s.isFull()).toBe(false);
    s.addPlayer("p2", "sock2", "tok2");
    expect(s.isFull()).toBe(true);
  });

  it("bothConnected 要求两人都在且都有 socket", () => {
    const s = new FakeSession();
    s.addPlayer("p1", "sock1", "tok1");
    s.addPlayer("p2", "sock2", "tok2");
    expect(s.bothConnected()).toBe(true);
    s.markDisconnected("p2");
    expect(s.bothConnected()).toBe(false);
    expect(s.anyConnected()).toBe(true);
  });

  it("findByToken 按 token 认人,认不出返回 undefined", () => {
    const s = new FakeSession();
    s.addPlayer("p1", "sock1", "tok1");
    s.addPlayer("p2", "sock2", "tok2");
    expect(s.findByToken("tok2")?.id).toBe("p2");
    expect(s.findByToken("forged")).toBeUndefined();
  });

  it("最后一个人掉线才开始记 emptySince", () => {
    const s = new FakeSession();
    s.addPlayer("p1", "sock1", "tok1");
    s.addPlayer("p2", "sock2", "tok2");
    s.markDisconnected("p1", 1000);
    expect(s.emptySince).toBeNull(); // p2 还在
    s.markDisconnected("p2", 2000);
    expect(s.emptySince).toBe(2000);
  });

  it("重连清掉 emptySince", () => {
    const s = new FakeSession();
    s.addPlayer("p1", "sock1", "tok1");
    s.markDisconnected("p1", 1000);
    expect(s.emptySince).toBe(1000);
    s.markConnected("p1", "sock1b");
    expect(s.emptySince).toBeNull();
    expect(s.players.p1?.socketId).toBe("sock1b");
  });

  it("空置时间够久才可回收", () => {
    const s = new FakeSession();
    s.addPlayer("p1", "sock1", "tok1");
    expect(s.isSweepable(1000, 5000)).toBe(false); // 还有人在线
    s.markDisconnected("p1", 1000);
    expect(s.isSweepable(1000, 1500)).toBe(false); // 只空了 500ms
    expect(s.isSweepable(1000, 2000)).toBe(true);
  });

  it("emptySince 只在第一次归零时记,后续掉线不刷新", () => {
    const s = new FakeSession();
    s.addPlayer("p1", "sock1", "tok1");
    s.markDisconnected("p1", 1000);
    s.markDisconnected("p1", 9000);
    expect(s.emptySince).toBe(1000);
  });

  const ids: PlayerId[] = ["p1", "p2"];
  it.each(ids)("markDisconnected 只清掉指定玩家的 socket: %s", (id) => {
    const s = new FakeSession();
    s.addPlayer("p1", "sock1", "tok1");
    s.addPlayer("p2", "sock2", "tok2");
    s.markDisconnected(id);
    expect(s.players[id]?.socketId).toBeNull();
    const other = id === "p1" ? "p2" : "p1";
    expect(s.players[other]?.socketId).not.toBeNull();
  });
});
```

- [x] **Step 2: 跑测试确认失败**

Run: `npm test --workspace @tpg/server`
Expected：FAIL —— `No workspaces found: --workspace=@tpg/server`。

- [x] **Step 3: 建 package.json 与 tsconfig.json**

Create `platform/server/package.json`：

```json
{
  "name": "@tpg/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "@tpg/protocol": "*",
    "socket.io": "^4.7.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "socket.io-client": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^4.1.10"
  }
}
```

Create `platform/server/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "types": ["node"],
    "lib": ["ESNext"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

`lib` 不含 DOM：这是纯服务端包，引用到 DOM 类型就说明放错了东西。

- [x] **Step 4: 写 presenceSession.ts**

Create `platform/server/src/presenceSession.ts`：

```ts
import { PLAYER_IDS, type PlayerId } from "@tpg/protocol";

export interface Player {
  id: PlayerId;
  socketId: string | null; // null = 掉线
  sessionToken: string;
}

/**
 * 连接簿记:谁连着、谁掉线了、房间空了多久。不碰任何玩法状态。
 * 各游戏的 GameSession 继承它,自己决定 state 的形状和 viewFor 怎么裁剪。
 */
export abstract class PresenceSession<S, V> {
  state: S | null = null;
  players: Partial<Record<PlayerId, Player>> = {};
  /**
   * 房间最后一次归零连接的时刻,有人在线时为 null。驱动废弃房间回收 ——
   * 关掉标签页不会发 leave_room,没有这个字段房间会永久泄漏。
   */
  emptySince: number | null = null;
  /**
   * 由 createGameServer 在每个接入点赋值。状态由计时器而不是 socket 事件驱动的
   * 游戏用它自己推视图;其余游戏赋了值也不用。
   */
  broadcast: (() => void) | null = null;

  /** 裁剪出某个玩家该看到的视图。没开局时返回 null。 */
  abstract viewFor(id: PlayerId): V | null;

  /** 房间销毁前的清理。有计时器的游戏覆写它。 */
  onDispose?(): void;

  addPlayer(id: PlayerId, socketId: string, sessionToken: string): void {
    this.players[id] = { id, socketId, sessionToken };
    this.emptySince = null;
  }

  isFull(): boolean {
    return !!this.players.p1 && !!this.players.p2;
  }

  anyConnected(): boolean {
    return !!this.players.p1?.socketId || !!this.players.p2?.socketId;
  }

  /** 两人都在座且都有活 socket。重开一局之类的动作要求这个。 */
  bothConnected(): boolean {
    return (
      this.isFull() &&
      !!this.players.p1?.socketId &&
      !!this.players.p2?.socketId
    );
  }

  /** rejoin 时按 token 认人。认不出就是伪造或过期的会话。 */
  findByToken(sessionToken: string): Player | undefined {
    return PLAYER_IDS.map((id) => this.players[id]).find(
      (p) => p?.sessionToken === sessionToken,
    );
  }

  markConnected(id: PlayerId, socketId: string): void {
    const player = this.players[id];
    if (player) player.socketId = socketId;
    this.emptySince = null;
  }

  markDisconnected(id: PlayerId, now = Date.now()): void {
    const player = this.players[id];
    if (player) player.socketId = null;
    if (!this.anyConnected() && this.emptySince === null) this.emptySince = now;
  }

  /** 完全空置满 ttlMs 之后可回收。 */
  isSweepable(ttlMs: number, now = Date.now()): boolean {
    return this.emptySince !== null && now - this.emptySince >= ttlMs;
  }
}
```

- [x] **Step 5: 写 rooms.test.ts**

Create `platform/server/test/rooms.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { RoomRegistry, makeRoomCode, makeToken } from "../src/rooms";

class FakeSession {
  disposed = 0;
  emptySince: number | null = null;
  onDispose(): void {
    this.disposed += 1;
  }
  isSweepable(ttlMs: number, now = Date.now()): boolean {
    return this.emptySince !== null && now - this.emptySince >= ttlMs;
  }
}

describe("makeRoomCode", () => {
  it("6 位,只用不易混淆的字符", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = makeRoomCode();
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it("不含 I O 0 1 —— 房间码要靠嘴念给对方", () => {
    const codes = Array.from({ length: 500 }, makeRoomCode).join("");
    expect(codes).not.toMatch(/[IO01]/);
  });
});

describe("makeToken", () => {
  it("32 个十六进制字符", () => {
    expect(makeToken()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("不重复 —— 它是身份凭证,不是房间码", () => {
    const tokens = new Set(Array.from({ length: 1000 }, makeToken));
    expect(tokens.size).toBe(1000);
  });
});

describe("RoomRegistry", () => {
  it("create 给出房间码和工厂造的 session", () => {
    const reg = new RoomRegistry(() => new FakeSession());
    const { roomCode, session } = reg.create();
    expect(roomCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(reg.get(roomCode)).toBe(session);
  });

  it("房间码不撞", () => {
    const reg = new RoomRegistry(() => new FakeSession());
    const codes = new Set<string>();
    for (let i = 0; i < 300; i += 1) codes.add(reg.create().roomCode);
    expect(codes.size).toBe(300);
  });

  it("get 取不存在的房间返回 undefined", () => {
    const reg = new RoomRegistry(() => new FakeSession());
    expect(reg.get("NOPE22")).toBeUndefined();
  });

  it("delete 会调 onDispose,让带计时器的游戏能清掉它", () => {
    const reg = new RoomRegistry(() => new FakeSession());
    const { roomCode, session } = reg.create();
    reg.delete(roomCode);
    expect(session.disposed).toBe(1);
    expect(reg.get(roomCode)).toBeUndefined();
  });

  it("delete 不存在的房间不抛错", () => {
    const reg = new RoomRegistry(() => new FakeSession());
    expect(() => reg.delete("NOPE22")).not.toThrow();
  });

  it("sweep 只回收空置够久的,并调 onDispose", () => {
    const reg = new RoomRegistry(() => new FakeSession());
    const a = reg.create();
    const b = reg.create();
    a.session.emptySince = 1000;
    b.session.emptySince = 4500;
    const removed = reg.sweep(1000, 5000);
    expect(removed).toEqual([a.roomCode]);
    expect(a.session.disposed).toBe(1);
    expect(reg.get(a.roomCode)).toBeUndefined();
    expect(reg.get(b.roomCode)).toBe(b.session);
    expect(b.session.disposed).toBe(0);
  });

  it("sweep 不动还有人在线的房间", () => {
    const reg = new RoomRegistry(() => new FakeSession());
    const { roomCode } = reg.create(); // emptySince 仍是 null
    expect(reg.sweep(0, 1e12)).toEqual([]);
    expect(reg.get(roomCode)).toBeDefined();
  });
});
```

- [x] **Step 6: 跑测试确认它失败**

Run: `npm test --workspace @tpg/server`
Expected：FAIL —— `Cannot find module '../src/rooms'`（presenceSession 那组应当已经过）。

- [x] **Step 7: 写 rooms.ts**

Create `platform/server/src/rooms.ts`：

```ts
import { randomBytes } from "node:crypto";

// 去掉了 I O 0 1:房间码要靠嘴念给对方。
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeRoomCode(): string {
  let value = "";
  for (let i = 0; i < 6; i += 1) {
    value += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return value;
}

/** 会话 token 走 crypto 而不是 Math.random —— 它是身份凭证。 */
export function makeToken(): string {
  return randomBytes(16).toString("hex");
}

/** RoomRegistry 对 session 的唯一要求。 */
interface Sweepable {
  isSweepable(ttlMs: number, now?: number): boolean;
  onDispose?(): void;
}

export class RoomRegistry<S extends Sweepable> {
  private rooms = new Map<string, S>();

  constructor(private readonly createSession: () => S) {}

  create(): { roomCode: string; session: S } {
    let roomCode = makeRoomCode();
    while (this.rooms.has(roomCode)) roomCode = makeRoomCode();
    const session = this.createSession();
    this.rooms.set(roomCode, session);
    return { roomCode, session };
  }

  get(roomCode: string): S | undefined {
    return this.rooms.get(roomCode);
  }

  delete(roomCode: string): void {
    this.rooms.get(roomCode)?.onDispose?.();
    this.rooms.delete(roomCode);
  }

  /**
   * 回收已经完全空置(双方都没有连接的 socket)超过 ttlMs 的房间,返回删掉的房间码。
   * 服务器定时调用 —— 玩家关标签页不会发 leave_room。
   */
  sweep(ttlMs: number, now = Date.now()): string[] {
    const removed: string[] = [];
    for (const [roomCode, session] of this.rooms) {
      if (session.isSweepable(ttlMs, now)) {
        session.onDispose?.();
        this.rooms.delete(roomCode);
        removed.push(roomCode);
      }
    }
    return removed;
  }
}
```

- [x] **Step 8: 写 barrel**

Create `platform/server/src/index.ts`：

```ts
export { PresenceSession } from "./presenceSession";
export type { Player } from "./presenceSession";
export { RoomRegistry, makeRoomCode, makeToken } from "./rooms";
```

（`gameServer.ts` 在 Task 2 加进来。）

- [x] **Step 9: 安装并跑测试**

Run: `npm install && npm test --workspace @tpg/server`
Expected：两组测试全过（presenceSession 10 个 —— `it.each` 算两条 ——
rooms 11 个，共 21 个）。

- [x] **Step 10: 类型检查**

Run: `npm run typecheck --workspace @tpg/server`
Expected：无输出。

- [x] **Step 11: 全量回归**

Run: `npm test 2>&1 | grep -E "Tests +[0-9]+ passed"`
Expected：156 + 21 = 177 passed。四个游戏还没动，它们的 42 个 server 测试必须
一个不少 —— 这个数字比总数更重要。

- [x] **Step 12: 格式化并提交**

```bash
npm run format
npm run format:check
git add platform package.json package-lock.json
git commit -m "feat(platform): add @tpg/server with PresenceSession and RoomRegistry

The connection bookkeeping is byte-identical in the four games'
gameSession.ts apart from formatting, and rooms.ts differs only in how
it constructs GameSession, so the registry takes a factory instead.

findByToken and bothConnected are lifted out of the four index.ts,
where the same expression appeared inline in rejoin and in the
rematch guard. onDispose replaces flip-math's clearTimer call, which
the registry now makes on delete and on sweep."
```

---

## Task 2: createGameServer 与最小假游戏的集成测试

**Files:**
- Create: `platform/server/src/gameServer.ts`
- Modify: `platform/server/src/index.ts`
- Test: `platform/server/test/gameServer.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `PresenceSession`、`RoomRegistry`、`makeToken`；
  `@tpg/protocol` 的 `PLAYER_IDS`、`PlayerId`、`ErrorCode`
- Produces:
  - `isRecord(v: unknown): v is Record<string, unknown>`
  - `corsOrigin(): string | string[] | boolean`
  - `interface ActionCtx<S>`：字段 `session: S`、`playerId: PlayerId`、
    `socket: Socket`；方法 `broadcastViews(): void`、
    `broadcastPerPlayer<T>(event: string, make: (id: PlayerId) => T | null): void`、
    `fail(code: ErrorCode): void`
  - `type ActionHandler<S> = (ctx: ActionCtx<S>, data: unknown) => void`
  - `interface ActionDef<S>`：`{ requireBothConnected?: boolean; handler: ActionHandler<S> }`
  - `interface GameServerOptions<S>`：`createSession()`、`onStart(ctx)`、
    `isInProgress(session)`、`actions`、可选 `onRejoin(ctx)`、`roomTtlMs`、
    `sweepIntervalMs`
  - `createGameServer<S>(opts): (port: number) => Promise<{ port: number; close: () => Promise<void> }>`

  Task 3–6 用这些名字重写各游戏的 `index.ts`。

- [x] **Step 1: 写最小假游戏的集成测试**

Create `platform/server/test/gameServer.test.ts`：

```ts
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

function counterServer(overrides: { roomTtlMs?: number; sweepIntervalMs?: number } = {}) {
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
  return new Promise((resolve) => s.once(event, resolve as (v: unknown) => void));
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
    b.emit("join_room", { roomCode: created.roomCode });
    await once(a, "view_update");
    const moved = once(b, "view_update");
    a.emit("add", { n: 3 });
    await moved;

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

    const moved = once(a, "view_update");
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
```

- [x] **Step 2: 跑测试确认失败**

Run: `npm test --workspace @tpg/server`
Expected：FAIL —— `Cannot find module '../src/gameServer'`。

- [x] **Step 3: 写 gameServer.ts**

Create `platform/server/src/gameServer.ts`：

```ts
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
  /** 游戏自己的 socket 事件。裸函数等价于 { handler } 。 */
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
```

- [x] **Step 4: 更新 barrel**

`platform/server/src/index.ts` 整个替换为：

```ts
export { PresenceSession } from "./presenceSession";
export type { Player } from "./presenceSession";
export { RoomRegistry, makeRoomCode, makeToken } from "./rooms";
export { createGameServer, corsOrigin, isRecord } from "./gameServer";
export type {
  ActionCtx,
  ActionDef,
  ActionHandler,
  GameServerOptions,
} from "./gameServer";
```

- [x] **Step 5: 跑测试**

Run: `npm test --workspace @tpg/server`
Expected：21 + 19 = 40 passed。

失败的话别改测试去迁就实现 —— 这 16 条集成测试是四个游戏迁移时唯一的安全网，
它们描述的行为就是四份 `index.ts` 现在的行为。

- [x] **Step 6: 类型检查与全量回归**

Run: `npm run typecheck --workspace @tpg/server`
Expected：无输出。

Run: `npm test 2>&1 | grep -E "Tests +[0-9]+ passed"`
Expected：156 + 40 = 196 passed。

- [x] **Step 7: 格式化并提交**

```bash
npm run format
npm run format:check
git add platform
git commit -m "feat(platform): add createGameServer

The five session-layer handlers — create_room, join_room, rejoin,
leave_room, disconnect — are the same in all four games, as is the
http/socket.io/sweeper/close scaffolding. What differs is three things,
so those become options: how a session is created, what happens when
the second player joins, and how 'the game is still running' is
decided (black-and-white checks phase === playing, the others check
phase !== finished).

Rematch is not a fixed handler. black-and-white, flip-math and
add-to-fifty call it rematch while texas-poker has next_hand and
restart_match, but all three share one guard — both players connected,
else OPPONENT_GONE — so that becomes requireBothConnected on an action.

The framework never broadcasts on its own: flip-math's session pushes
views from its own timers, so it assigns session.broadcast at every
attach point and the game decides when to send."
```

---

## Task 3: black-and-white 迁移到 @tpg/server

**Files:**
- Modify: `black-and-white/packages/server/package.json`
- Modify: `black-and-white/packages/server/src/gameSession.ts`
- Delete: `black-and-white/packages/server/src/rooms.ts`
- Modify: `black-and-white/packages/server/src/index.ts`

**Interfaces:**
- Consumes: Task 1 与 Task 2 的全部导出
- Produces: `startServer(port, options?)` 签名不变
  （`options`：`roomTtlMs?`、`sweepIntervalMs?`），
  所以 `test/integration.test.ts` 的 19 个测试一行不改

先迁 black-and-white：它是四个里唯一有第二种按玩家裁剪广播（`game_over`）的，
也是唯一在 rejoin 时要补发终局的，压力最大。这套机制在它身上站住了，
另外三个就只是填空。

- [x] **Step 1: 记下 baseline**

Run: `npm test --workspace @bw/server 2>&1 | grep -E "Tests "`
Expected：19 passed。

- [x] **Step 2: 加依赖**

`black-and-white/packages/server/package.json` 的 `dependencies` 加一条
`"@tpg/server": "*"`，放在 `"@bw/shared"` 之后。

- [x] **Step 3: gameSession.ts 改成继承 PresenceSession**

`black-and-white/packages/server/src/gameSession.ts` 整个替换为：

```ts
import {
  createGame,
  toClientView,
  toReview,
  type ClientView,
  type GameReview,
  type GameState,
  type PlayerId,
} from "@bw/shared";
import { PresenceSession } from "@tpg/server";

export class GameSession extends PresenceSession<GameState, ClientView> {
  start(firstLeader: PlayerId): void {
    this.state = createGame(firstLeader);
  }

  viewFor(id: PlayerId): ClientView | null {
    if (!this.state) return null;
    return toClientView(this.state, id);
  }

  reviewFor(id: PlayerId): GameReview | null {
    if (!this.state) return null;
    return toReview(this.state, id);
  }
}
```

`Player` 接口、`players`、`emptySince` 和那 6 个连接簿记方法全部由基类提供，
这里删掉。

- [x] **Step 4: 删掉自己的 rooms.ts**

```bash
git rm black-and-white/packages/server/src/rooms.ts
```

`makeRoomCode` / `makeToken` / `RoomRegistry` 现在都从 `@tpg/server` 来。

先确认没有别处 import 它：

```bash
grep -rn "from \"./rooms\"\|from \"../src/rooms\"" black-and-white/packages/server
```

Expected：只有 `src/index.ts`（下一步会重写）。有测试文件引用的话停下来，
那意味着本游戏还有针对 rooms 的单元测试要一并处理。

- [x] **Step 5: 重写 index.ts**

`black-and-white/packages/server/src/index.ts` 整个替换为：

```ts
import { playCard, type PlayerId } from "@bw/shared";
import { createGameServer, isRecord } from "@tpg/server";
import { GameSession } from "./gameSession";

export interface ServerOptions {
  // 完全空置的房间保留多久(默认 10 分钟)。
  roomTtlMs?: number;
  // 扫房间隔(默认 60 秒)。
  sweepIntervalMs?: number;
}

function coinFlip(): PlayerId {
  return Math.random() < 0.5 ? "p1" : "p2";
}

/** 开局/再来一局:抛硬币定先手,广播首个视图。 */
function startRound(ctx: {
  session: GameSession;
  broadcastViews(): void;
}): void {
  ctx.session.start(coinFlip());
  ctx.broadcastViews();
}

const makeServer = (options: ServerOptions = {}) =>
  createGameServer<GameSession>({
    createSession: () => new GameSession(),
    onStart: startRound,
    // 只有 playing 才算进行中:waiting 还没开局,finished 已经结算。
    isInProgress: (s) => s.state?.phase === "playing",
    actions: {
      play_card: (ctx, data) => {
        if (!isRecord(data) || typeof data.card !== "number") {
          ctx.fail("INVALID_REQUEST");
          return;
        }
        const session = ctx.session;
        if (!session.state) return;
        try {
          session.state = playCard(session.state, ctx.playerId, data.card);
        } catch {
          ctx.fail("INVALID_MOVE");
          return;
        }
        ctx.broadcastViews();
        if (session.state.phase === "finished") {
          ctx.broadcastPerPlayer("game_over", (id) => session.reviewFor(id));
        }
      },
      rematch: {
        requireBothConnected: true,
        handler: (ctx) => {
          // 只有上一局真的结束了才重开。
          if (ctx.session.state?.phase !== "finished") return;
          startRound(ctx);
        },
      },
    },
    // 掉线重连回到已结束的局:视图之外再补一份复盘,否则终局界面是空的。
    onRejoin: (ctx) => {
      if (ctx.session.state?.phase !== "finished") return;
      const review = ctx.session.reviewFor(ctx.playerId);
      if (review !== null) ctx.socket.emit("game_over", review);
    },
    roomTtlMs: options.roomTtlMs,
    sweepIntervalMs: options.sweepIntervalMs,
  });

export async function startServer(
  port: number,
  options: ServerOptions = {},
): Promise<{ port: number; close: () => Promise<void> }> {
  return makeServer(options)(port);
}

// 直接运行时启动固定端口
if (process.argv[1]?.endsWith("index.ts")) {
  startServer(Number(process.env.PORT) || 3001).then(({ port }) =>
    console.log(`server on :${port}`),
  );
}
```

- [x] **Step 6: 安装并跑测试**

Run: `npm install && npm test --workspace @bw/server 2>&1 | grep -E "Tests |FAIL|✗"`
Expected：19 passed，一个都不少。

失败的话读报错，改 `index.ts` 或 `gameSession.ts`，**不要改测试**。

- [x] **Step 7: 确认行数真的降下来了**

```bash
wc -l black-and-white/packages/server/src/*.ts
```

Expected：`index.ts` 从 246 行降到 90 行以内，`gameSession.ts` 从 75 行降到
30 行以内，`rooms.ts` 不存在。

- [x] **Step 8: 全量回归并提交**

Run: `npm test 2>&1 | grep -E "Tests +[0-9]+ passed" | sed 's/.*Tests *//' | awk '{s+=$1} END {print s}'`
Expected：196。

```bash
npm run format && npm run format:check
git add black-and-white package.json package-lock.json
git commit -m "refactor(black-and-white): run the server on @tpg/server

index.ts keeps only play_card, rematch and the game_over broadcasts;
the five session-layer handlers and the server scaffolding come from
createGameServer. gameSession.ts keeps state, start, viewFor and
reviewFor — the connection bookkeeping is the base class now — and
rooms.ts is gone.

The 19 integration tests are unchanged: startServer(port, options)
still exists with the same option names, so they are the regression
for this extraction rather than something to adjust."
```

---

## Task 4: add-to-fifty 迁移到 @tpg/server

**Files:**
- Modify: `add-to-fifty/packages/server/package.json`
- Modify: `add-to-fifty/packages/server/src/gameSession.ts`
- Delete: `add-to-fifty/packages/server/src/rooms.ts`
- Modify: `add-to-fifty/packages/server/src/index.ts`

**Interfaces:**
- Consumes: Task 1、2 的导出；Task 3 已经验证过 `broadcastPerPlayer` 与 `onRejoin`
- Produces: `startServer(port, options?)`，`options` 为
  `{ deck?: Card[]; firstPlayer?: PlayerId; roomTtlMs?: number; sweepIntervalMs?: number }`
  —— 与现在完全一致，6 个集成测试不改

- [x] **Step 1: 记下 baseline**

Run: `npm test --workspace @add-to-fifty/server 2>&1 | grep -E "Tests "`
Expected：6 passed。

- [x] **Step 2: 加依赖**

`add-to-fifty/packages/server/package.json` 的 `dependencies` 加
`"@tpg/server": "*"`。

- [x] **Step 3: gameSession.ts 改成继承 PresenceSession**

`add-to-fifty/packages/server/src/gameSession.ts` 整个替换为：

```ts
import {
  createDeck,
  createGame,
  playCard,
  shuffleDeck,
  toClientView,
  type Card,
  type ClientView,
  type GameState,
  type PlayerId,
} from "@add-to-fifty/shared";
import { PresenceSession } from "@tpg/server";

export class GameSession extends PresenceSession<GameState, ClientView> {
  constructor(
    private readonly makeDeck: () => Card[] = () => shuffleDeck(createDeck()),
    private readonly firstPlayer: PlayerId = "p1",
  ) {
    super();
  }

  start(): void {
    this.state = createGame(this.firstPlayer, this.makeDeck());
  }

  play(player: PlayerId, cardId: string, kingDelta?: number): void {
    if (!this.state) throw new Error("Game has not started");
    this.state = playCard(this.state, player, cardId, kingDelta);
  }

  viewFor(id: PlayerId): ClientView | null {
    if (!this.state) return null;
    return toClientView(this.state, id);
  }
}
```

有构造函数的子类必须先调 `super()`，别漏。

- [x] **Step 4: 删掉自己的 rooms.ts**

```bash
grep -rn "from \"./rooms\"" add-to-fifty/packages/server
git rm add-to-fifty/packages/server/src/rooms.ts
```

- [x] **Step 5: 重写 index.ts**

`add-to-fifty/packages/server/src/index.ts` 整个替换为：

```ts
import type { Card, PlayerId } from "@add-to-fifty/shared";
import { createGameServer, isRecord } from "@tpg/server";
import { GameSession } from "./gameSession";

export interface ServerOptions {
  deck?: Card[];
  firstPlayer?: PlayerId;
  roomTtlMs?: number;
  sweepIntervalMs?: number;
}

const makeServer = (options: ServerOptions = {}) => {
  // 每局都要一副新牌,所以存工厂而不是数组本身。
  const deckFactory = options.deck ? () => [...options.deck!] : undefined;
  return createGameServer<GameSession>({
    createSession: () =>
      new GameSession(deckFactory, options.firstPlayer ?? "p1"),
    onStart: (ctx) => {
      ctx.session.start();
      ctx.broadcastViews();
    },
    isInProgress: (s) => s.state !== null && s.state.phase !== "finished",
    actions: {
      play_card: (ctx, data) => {
        if (!isRecord(data) || typeof data.cardId !== "string") {
          ctx.fail("INVALID_REQUEST");
          return;
        }
        try {
          ctx.session.play(
            ctx.playerId,
            data.cardId,
            typeof data.kingDelta === "number" ? data.kingDelta : undefined,
          );
        } catch {
          ctx.fail("INVALID_MOVE");
          return;
        }
        ctx.broadcastViews();
      },
      rematch: {
        requireBothConnected: true,
        handler: (ctx) => {
          if (ctx.session.state?.phase !== "finished") return;
          ctx.session.start();
          ctx.broadcastViews();
        },
      },
    },
    roomTtlMs: options.roomTtlMs,
    sweepIntervalMs: options.sweepIntervalMs,
  });
};

export async function startServer(
  port: number,
  options: ServerOptions = {},
): Promise<{ port: number; close: () => Promise<void> }> {
  return makeServer(options)(port);
}

if (process.argv[1]?.endsWith("index.ts")) {
  startServer(Number(process.env.PORT) || 3001).then(({ port }) =>
    console.log(`add-to-fifty server on :${port}`),
  );
}
```

- [x] **Step 6: 跑测试**

Run: `npm install && npm test --workspace @add-to-fifty/server 2>&1 | grep -E "Tests |FAIL"`
Expected：6 passed。

- [x] **Step 7: 全量回归并提交**

Run: `npm test 2>&1 | grep -E "Tests +[0-9]+ passed" | sed 's/.*Tests *//' | awk '{s+=$1} END {print s}'`
Expected：196。

```bash
npm run format && npm run format:check
git add add-to-fifty package.json package-lock.json
git commit -m "refactor(add-to-fifty): run the server on @tpg/server"
```

---

## Task 5: texas-poker 迁移到 @tpg/server

**Files:**
- Modify: `texas-poker/packages/server/package.json`
- Modify: `texas-poker/packages/server/src/gameSession.ts`
- Delete: `texas-poker/packages/server/src/rooms.ts`
- Modify: `texas-poker/packages/server/src/index.ts`

**Interfaces:**
- Consumes: Task 1、2 的导出。texas-poker 是唯一有**两个** `requireBothConnected`
  动作的游戏（`next_hand`、`restart_match`），验证这个机制不是为 rematch 特设的
- Produces: `startServer(port, options?)`，`options` 为
  `{ deck?: Card[]; config?: GameConfig; roomTtlMs?: number; sweepIntervalMs?: number }`
  —— 8 个集成测试不改

- [x] **Step 1: 记下 baseline**

Run: `npm test --workspace @texas-poker/server 2>&1 | grep -E "Tests "`
Expected：8 passed。

- [x] **Step 2: 加依赖**

`texas-poker/packages/server/package.json` 的 `dependencies` 加
`"@tpg/server": "*"`。

- [x] **Step 3: gameSession.ts 改成继承 PresenceSession**

`texas-poker/packages/server/src/gameSession.ts` 里，把

```ts
export interface Player {
  id: PlayerId;
  socketId: string | null;
  sessionToken: string;
}

export class GameSession {
  state: GameState | null = null;
  players: Partial<Record<PlayerId, Player>> = {};
  emptySince: number | null = null;
  private config: GameConfig;
```

替换为

```ts
export class GameSession extends PresenceSession<GameState, ClientView> {
  private config: GameConfig;
```

并在构造函数体最前面加 `super();`。然后删掉 `addPlayer`、`isFull`、
`anyConnected`、`markConnected`、`markDisconnected`、`isSweepable` 六个方法
（基类提供）。import 补上：

```ts
import { PresenceSession } from "@tpg/server";
```

并在 `@texas-poker/shared` 的 type import 里加 `ClientView`。
`start`、`nextHand`、`restartMatch`、`updateSettings`、`dispatch`、`viewFor`
全部保留，一行不改。

- [x] **Step 4: 删掉自己的 rooms.ts**

```bash
grep -rn "from \"./rooms\"" texas-poker/packages/server
git rm texas-poker/packages/server/src/rooms.ts
```

- [x] **Step 5: 重写 index.ts**

`texas-poker/packages/server/src/index.ts` 整个替换为：

```ts
import {
  DEFAULT_CONFIG,
  type Card,
  type GameConfig,
  type PlayerAction,
} from "@texas-poker/shared";
import { createGameServer, isRecord } from "@tpg/server";
import { GameSession } from "./gameSession";

export interface ServerOptions {
  deck?: Card[];
  config?: GameConfig;
  roomTtlMs?: number;
  sweepIntervalMs?: number;
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
): Partial<Pick<GameConfig, "enforceMinRaise" | "startingChips">> | null {
  if (!isRecord(data)) return null;
  const settings: Partial<
    Pick<GameConfig, "enforceMinRaise" | "startingChips">
  > = {};
  if ("enforceMinRaise" in data) {
    if (typeof data.enforceMinRaise !== "boolean") return null;
    settings.enforceMinRaise = data.enforceMinRaise;
  }
  if ("startingChips" in data) {
    if (
      typeof data.startingChips !== "number" ||
      !Number.isInteger(data.startingChips) ||
      data.startingChips < 20 ||
      data.startingChips > 100000
    ) {
      return null;
    }
    settings.startingChips = data.startingChips;
  }
  return settings;
}

const makeServer = (options: ServerOptions = {}) => {
  const deckFactory = options.deck ? () => [...options.deck!] : undefined;
  const config = options.config ?? DEFAULT_CONFIG;
  return createGameServer<GameSession>({
    createSession: () => new GameSession(deckFactory, config),
    onStart: (ctx) => {
      ctx.session.start();
      ctx.broadcastViews();
    },
    isInProgress: (s) => s.state !== null && s.state.phase !== "finished",
    actions: {
      poker_action: (ctx, data) => {
        const action = parseAction(data);
        if (!action) {
          ctx.fail("INVALID_REQUEST");
          return;
        }
        try {
          ctx.session.dispatch(ctx.playerId, action);
        } catch {
          ctx.fail("INVALID_MOVE");
          return;
        }
        ctx.broadcastViews();
      },
      next_hand: {
        requireBothConnected: true,
        handler: (ctx) => {
          try {
            ctx.session.nextHand();
          } catch {
            ctx.fail("INVALID_MOVE");
            return;
          }
          ctx.broadcastViews();
        },
      },
      restart_match: {
        requireBothConnected: true,
        handler: (ctx) => {
          try {
            ctx.session.restartMatch();
          } catch {
            ctx.fail("INVALID_MOVE");
            return;
          }
          ctx.broadcastViews();
        },
      },
      update_settings: (ctx, data) => {
        const settings = parseSettings(data);
        if (!settings) {
          ctx.fail("INVALID_REQUEST");
          return;
        }
        ctx.session.updateSettings(settings);
        ctx.broadcastViews();
      },
    },
    roomTtlMs: options.roomTtlMs,
    sweepIntervalMs: options.sweepIntervalMs,
  });
};

export async function startServer(
  port: number,
  options: ServerOptions = {},
): Promise<{ port: number; close: () => Promise<void> }> {
  return makeServer(options)(port);
}

if (process.argv[1]?.endsWith("index.ts")) {
  startServer(Number(process.env.PORT) || 3001).then(({ port }) =>
    console.log(`texas-poker server on :${port}`),
  );
}
```

- [x] **Step 6: 跑测试**

Run: `npm install && npm test --workspace @texas-poker/server 2>&1 | grep -E "Tests |FAIL"`
Expected：8 passed。

`update_settings` 现在也走 `requireBothConnected: false`（默认），和原来一致 ——
原实现没有这个 guard。**不要顺手给它加上**，那会改变行为，而测试可能覆盖不到。

- [x] **Step 7: 全量回归并提交**

Run: `npm test 2>&1 | grep -E "Tests +[0-9]+ passed" | sed 's/.*Tests *//' | awk '{s+=$1} END {print s}'`
Expected：196。

```bash
npm run format && npm run format:check
git add texas-poker package.json package-lock.json
git commit -m "refactor(texas-poker): run the server on @tpg/server

next_hand and restart_match both carry requireBothConnected, which is
what that option was generalised for: the other three games spell the
same guard as a single rematch handler. update_settings keeps no guard,
matching the original."
```

---

## Task 6: flip-math 迁移到 @tpg/server

**Files:**
- Modify: `flip-math/packages/server/package.json`
- Modify: `flip-math/packages/server/src/gameSession.ts`
- Delete: `flip-math/packages/server/src/rooms.ts`
- Modify: `flip-math/packages/server/src/index.ts`

**Interfaces:**
- Consumes: Task 1、2 的导出。flip-math 是唯一用 `session.broadcast` 和
  `onDispose` 的游戏，放在最后因为它检验的是这套机制最不常用的两条路径
- Produces: `startServer(port, options?)`，`options` 为
  `{ durations?: Durations; roomTtlMs?: number; sweepIntervalMs?: number }`
  —— 9 个集成测试不改

flip-math 和另外三个的根本区别：它的状态由计时器推进（preview → countdown →
answering → resolve → reveal），不是由 socket 事件推进。所以它的 session 在每次
状态转移后自己广播，而不是等 handler 调 `broadcastViews()`。
`PresenceSession.broadcast` 就是为它留的口子，`createGameServer` 在
`create_room`、`join_room`、`rejoin` 三个接入点都会赋值。

- [x] **Step 1: 记下 baseline**

Run: `npm test --workspace @fm/server 2>&1 | grep -E "Tests "`
Expected：9 passed。

- [x] **Step 2: 加依赖**

`flip-math/packages/server/package.json` 的 `dependencies` 加
`"@tpg/server": "*"`。

- [x] **Step 3: gameSession.ts 改成继承 PresenceSession**

`flip-math/packages/server/src/gameSession.ts` 里做四处改动：

一、import 加上基类和 `ClientView`：

```ts
import { createGame, reduce, toClientView, DURATIONS } from "@fm/shared";
import type {
  Action,
  ClientView,
  Durations,
  GameState,
  Phase,
  PlayerId,
} from "@fm/shared";
import { PresenceSession } from "@tpg/server";
```

二、`export interface Player { ... }` 整块删掉（基类提供）。

三、类头与字段：把

```ts
export class GameSession {
  state: GameState | null = null;
  players: Partial<Record<PlayerId, Player>> = {};
  emptySince: number | null = null;
  // 注入的广播回调(由 index.ts 设置),计时器到点也用它推送视图。
  broadcast: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private durations: Durations = DURATIONS) {}
```

替换为

```ts
export class GameSession extends PresenceSession<GameState, ClientView> {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private durations: Durations = DURATIONS) {
    super();
  }
```

`state`、`players`、`emptySince`、`broadcast` 都来自基类，这里不再声明。

四、删掉 `addPlayer`、`isFull`、`anyConnected`、`markConnected`、
`markDisconnected`、`isSweepable` 六个方法，并把 `clearTimer` 改名为
`onDispose`，让 `RoomRegistry` 在删房和扫房时自动调用：

```ts
  /** 房间销毁前清掉计时器,否则被回收的房间还会继续推进状态。 */
  onDispose(): void {
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
```

`clearTimer` 从 public 变成 private —— 原来它是给 `rooms.ts` 调的，现在
`onDispose` 接过了这个职责。`start`、`dispatch`、`viewFor`、`ctx`、
`afterTransition`、`scheduleTimer` 全部保留，一行不改。

`viewFor` 的返回类型要写明，否则基类的抽象签名对不上：

```ts
  viewFor(id: PlayerId): ClientView | null {
    return this.state ? toClientView(this.state, id) : null;
  }
```

- [x] **Step 4: 删掉自己的 rooms.ts**

```bash
grep -rn "from \"./rooms\"" flip-math/packages/server
git rm flip-math/packages/server/src/rooms.ts
```

- [x] **Step 5: 重写 index.ts**

`flip-math/packages/server/src/index.ts` 整个替换为：

```ts
import type { Durations } from "@fm/shared";
import { createGameServer, isRecord } from "@tpg/server";
import { GameSession } from "./gameSession";

export interface ServerOptions {
  roomTtlMs?: number;
  sweepIntervalMs?: number;
  durations?: Durations; // 测试可注入极短时长
}

const makeServer = (options: ServerOptions = {}) =>
  createGameServer<GameSession>({
    createSession: () => new GameSession(options.durations),
    // start() 内部就会广播:状态由计时器推进,每次转移都要推送。
    // 所以这里不调 ctx.broadcastViews(),否则首个视图会发两遍。
    onStart: (ctx) => ctx.session.start(),
    isInProgress: (s) => s.state !== null && s.state.phase !== "finished",
    actions: {
      // 抢答竞态:输的一方在 answering 阶段再 buzz 会被 reduce 拒绝。
      // 静默忽略而不回 error_msg —— 那是正常竞态,不是玩家做错了什么。
      buzz: (ctx) => {
        try {
          ctx.session.dispatch({ type: "BUZZ", player: ctx.playerId });
        } catch {
          /* ignore lost buzz */
        }
      },
      // 非 ready 阶段或重复点击:reduce 幂等或抛错,同样静默忽略。
      ready: (ctx) => {
        try {
          ctx.session.dispatch({ type: "READY", player: ctx.playerId });
        } catch {
          /* ignore stray ready */
        }
      },
      select_cell: (ctx, data) => {
        if (!isRecord(data) || typeof data.index !== "number") {
          ctx.fail("INVALID_REQUEST");
          return;
        }
        try {
          ctx.session.dispatch({
            type: "SELECT",
            player: ctx.playerId,
            cell: data.index,
          });
        } catch {
          ctx.fail("INVALID_MOVE");
        }
      },
      rematch: {
        requireBothConnected: true,
        handler: (ctx) => {
          if (ctx.session.state?.phase !== "finished") return;
          ctx.session.start();
        },
      },
    },
    roomTtlMs: options.roomTtlMs,
    sweepIntervalMs: options.sweepIntervalMs,
  });

export async function startServer(
  port: number,
  options: ServerOptions = {},
): Promise<{ port: number; close: () => Promise<void> }> {
  return makeServer(options)(port);
}

if (process.argv[1]?.endsWith("index.ts")) {
  startServer(Number(process.env.PORT) || 3001).then(({ port }) =>
    console.log(`flip-math server on :${port}`),
  );
}
```

注意三处与另外三个游戏不同、且都是有意的：动作 handler 里一次
`ctx.broadcastViews()` 都没有（session 自己推）、`onStart` 只调 `start()`、
`buzz` 和 `ready` 失败时静默而不回 `error_msg`。

- [x] **Step 6: 跑测试**

Run: `npm install && npm test --workspace @fm/server 2>&1 | grep -E "Tests |FAIL"`
Expected：9 passed。

这 9 个测试里有计时驱动的流程（注入 `FAST` durations），所以它们会实际验证
`session.broadcast` 在三个接入点都被赋上了值 —— 漏掉任何一个，计时器推进后
客户端就收不到视图，测试会卡住超时。

- [x] **Step 7: 确认计时器真的被回收**

Run: `npm test --workspace @tpg/server 2>&1 | grep -E "Tests "`
Expected：40 passed。

`onDispose` 现在由 `RoomRegistry` 在 `delete` 和 `sweep` 时调用，
platform 那边的 `rooms.test.ts` 已经断言了这一点。

- [x] **Step 8: 全量回归**

Run: `npm test 2>&1 | grep -E "Tests +[0-9]+ passed" | sed 's/.*Tests *//' | awk '{s+=$1} END {print s}'`
Expected：196。

- [x] **Step 9: 四个游戏的 server 行数汇总**

```bash
wc -l */packages/server/src/*.ts platform/server/src/*.ts
```

**实测结果**：四个游戏的 server 源码从 1550 行（`index.ts` 991 +
`gameSession.ts` 348 + `rooms.ts` 211）降到 566 行，`platform/server/src`
409 行。净减 575 行。

- [x] **Step 10: 提交**

```bash
npm run format && npm run format:check
git add flip-math package.json package-lock.json
git commit -m "refactor(flip-math): run the server on @tpg/server

flip-math's state is driven by timers, not by socket events, so its
session broadcasts on every transition instead of waiting for a
handler to call broadcastViews. PresenceSession.broadcast is the hook
for that and createGameServer assigns it at create_room, join_room and
rejoin, which removes the three injection lines from this index.ts.

clearTimer becomes onDispose, so RoomRegistry clears the timer when it
deletes or sweeps a room — a swept room used to keep advancing its
state."
```

---

## Task 7: 部署与浏览器验收

**Files:** 无改动 —— 这个 task 只验证

**Interfaces:**
- Consumes: Task 3–6 迁移后的四个 server

阶段 3 只动了 server 端，但 `Dockerfile` 的 deps stage 现在要多 COPY 一个
`platform/server/package.json`，否则镜像里 `npm ci` 会因为 workspace 树不完整
而失败。

- [x] **Step 1: 四份 Dockerfile 的 deps stage 加一行**

四个 `<game>/Dockerfile` 的 `deps` stage 里，在
`COPY platform/protocol/package.json ./platform/protocol/` 之后加：

```dockerfile
COPY platform/server/package.json ./platform/server/
```

四份加完之后确认它们仍然一字不差：

```bash
for g in black-and-white flip-math add-to-fifty texas-poker; do
  printf "  %-18s %s\n" "$g" \
    "$(sed -n '/^FROM node:22-alpine AS deps/,/^RUN npm ci/p' "$g/Dockerfile" | shasum | cut -c1-12)"
done
```

Expected：四个 hash 相同。

- [x] **Step 2: 四个镜像都要能构建**

```bash
for g in black-and-white flip-math add-to-fifty texas-poker; do
  echo "=== $g ==="
  (cd "$g" && docker compose build 2>&1 | tail -2)
done
```

Expected：四个都成功。

- [x] **Step 3: 起一个栈,确认服务器真的跑起来**

```bash
cd black-and-white && docker compose up -d && sleep 5
docker compose logs bw-server | tail -3
docker run --rm --network web curlimages/curl:latest -s \
  "http://bw-web:80/socket.io/?EIO=4&transport=polling" | head -1
docker compose down && cd ..
```

Expected：日志里有 `server on :3001`，socket.io 握手返回带 `"sid"` 的 JSON。
握手能过就说明容器里 tsx 解析到了 `@tpg/server` 和 `@tpg/protocol`。

- [x] **Step 4: 四个游戏在浏览器里各打一手**

阶段 3 改的是服务器权威侧，客户端一行没动，所以这一步验的是"改完之后游戏还能玩"。

逐个 preview_start（`bw-client` / `flip-client` / `a2f-client` / `texas-client`），
并用 Bash 后台起对应的游戏服务器（`npm run dev --workspace @<scope>/server`）。
每个游戏：建房 → 用 Node 端的 socket.io-client 当第二个玩家加入 → 在浏览器里
走一个动作 → 确认视图变化。

Node 端第二个玩家不能用第二个浏览器 tab：两个 tab 同源会共用 localStorage 里的
session token，第二个 tab 一加载就会以第一个玩家的身份 rejoin。

- [x] **Step 5: 提交**

```bash
npm run format && npm run format:check
git add .
git commit -m "build: copy platform/server's package.json into the four images

npm ci wants the lockfile and the workspace tree to agree, so a new
workspace has to reach every image's deps stage or the install fails."
```

---

## 阶段 3 完成后的状态

- `@tpg/server` 提供 `PresenceSession`、`RoomRegistry<S>`、`createGameServer`，
  409 行，40 个自己的测试，其中 16 个是跨游戏的会话层回归（用最小假游戏跑，
  不依赖任何真玩法）。
- 四个游戏的 `packages/server/src/rooms.ts` 全部删除，`gameSession.ts` 只剩玩法，
  `index.ts` 只剩自己的动作 handler。
- 四个游戏的 42 个 server 集成测试一行未改并全部通过 —— 这是抽取正确性的判据。
- 196 个测试全过，四个镜像能构建能跑。
- 下一阶段（4）抽 `platform/client`：四份 `socket.ts` 的会话管线、
  i18n 引擎、`status` 的 8 条共享文案，以及四份只差一行的 `i18n.test.ts`。
