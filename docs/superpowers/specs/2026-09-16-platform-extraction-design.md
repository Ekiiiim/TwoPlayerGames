# 跨游戏基础设施抽取 — 设计

2026-09-16

## 目标

四个游戏（black-and-white、flip-math、add-to-fifty、texas-poker）各自实现了一套
相同的房间/会话/i18n/大厅基础设施。把这些抽成 repo 根下的 `platform/*` 共享包，
玩法逻辑仍然各游戏独立。

## 现状测量

baseline（2026-09-16 实测）：四个游戏 151 个测试全过，四个 `svelte-check`
各 0 errors 0 warnings。

重复分布（行数为四个游戏合计）：

| 文件 | 合计 | 重复性质 |
| --- | --- | --- |
| `packages/server/src/index.ts` | 991 | 六个 handler + 服务器收尾逐字相同，只有动作 handler 不同 |
| `packages/client/src/i18n.ts` | 790 | 引擎部分四份一致；`status` 的 8 条文案一致 |
| `packages/client/src/socket.ts` | 397 | 会话管线一致，差 key 前缀与 emit 函数 |
| `packages/server/src/gameSession.ts` | 348 | 连接簿记那一半除缩进无差别 |
| `packages/client/test/i18n.test.ts` | 237 | 四份之间只差一行 |
| `DEPLOY.md` | 239 | 同一套步骤换名字 |
| `packages/client/src/lib/Lobby.svelte` | 224 | 行为一致，markup 四种写法 |
| `packages/server/src/rooms.ts` | 211 | 只差怎么 new 出 GameSession |
| `docker-compose.yml` | 135 | 模板换名字前缀 |
| `Dockerfile` | 126 | 模板换 workspace scope |
| `packages/client/src/lib/Button.svelte` | 98 | 同一套 API，四种实现 |
| `web/Caddyfile` | 68 | 模板换 server 主机名 |
| `packages/client/tsconfig.json` | 65 | 模板 |
| `packages/client/vite.config.ts` | 49 | 三份逐字相同 |
| `packages/client/src/lib/LangToggle.svelte` | 48 | 只差 Button 的 variant |
| 合计 | 4026 | 其中约 1400 行可消除 |

## 目标结构

```
package.json                    唯一 workspace root
platform/
  protocol/   @tpg/protocol     线协议类型
  server/     @tpg/server       PresenceSession、RoomRegistry<S>、createGameServer()
  client/     @tpg/client       createRoomSession()、createI18n()、共享词条、assertDictParity()
  ui/         @tpg/ui           Button、LangToggle、Lobby、token 契约
  build/      @tpg/build        vite config 工厂、tsconfig.base.json
  deploy/                       Dockerfile + Caddyfile 各一份（非 npm 包）
black-and-white/packages/{shared,server,client}
flip-math/packages/{shared,server,client}
add-to-fifty/packages/{shared,server,client}
texas-poker/packages/{shared,server,client}
proxy/
```

`platform/*` 全部按源码分发（`main: "src/index.ts"`），和现有 `packages/shared`
一致：不预编译，由消费方的 Vite / tsx 直接吃 TS 和 `.svelte` 源码。

## 阶段划分与提交粒度

七个阶段按依赖排序。每个阶段结束时 `npm test` 和 `npm run check` 必须全绿，
所以每个阶段是一个可独立回退的单元。阶段 3 和阶段 4 之间没有依赖，但顺序做
更容易定位问题。

阶段 3、4、5 内部按游戏逐个迁移，每迁一个游戏跑一次全量测试、提交一次。
迁移中途会出现「两个游戏用了 `createGameServer`、另两个还没用」的状态，这是
允许的——共享层和旧实现并存，测试仍然全绿。不允许的是让这个状态跨过阶段边界，
因为下一阶段的改动会压在它上面，测试红的时候分不清是谁的问题。

## 阶段 1 之后不能部署

「测试全绿」和「能部署」是两件事，这里会分叉。

阶段 1 删掉了 `<game>/package.json` 和 `<game>/package-lock.json`，而四个
`docker-compose.yml` 写的还是 `context: .`——Docker 的构建上下文仍是游戏目录，
而 `Dockerfile` 第一句就是 `COPY package.json package-lock.json ./`，那两个文件
已经不在那里了。所以阶段 1 一落地，四个镜像立刻构建不出来，直到阶段 6 把
context 抬到 repo 根为止。

修复的工作量不止改一行 `context`，有三处连带的：

1. `.dockerignore` 现在是每个游戏一份，Docker 只读 `<context>/.dockerignore`。
   context 抬到 repo 根后，四份都失效，要在 repo 根建一份。
2. 根 `package-lock.json` 覆盖全部 12 个 workspace，`npm ci` 要求 lockfile 与
   workspace 树一致。如果镜像里只 COPY 一个游戏的 package.json，另外三个游戏的
   workspace glob 匹配不到东西，`npm ci` 可能判定 lockfile 不同步而失败。
   稳妥做法是把四个游戏的 12 个 package.json 加 `platform/*` 的全部 COPY 进每个
   镜像——它们都是几百字节，代价只是任一 package.json 变动会让四个镜像的 deps
   层一起失效。
3. 产物路径变了：`/app/packages/client/dist` → `/app/<game>/packages/client/dist`。

**决定（2026-09-16）**：把这三处修复提前，插在阶段 2 的 protocol 包建好之后，
成为一个独立 task。放在 protocol 之后而不是紧跟 root 上移，是为了让 `platform/`
已经存在——Dockerfile 只写一次就能把它 COPY 进去，不用先写一版没有 platform 的
再改。破窗期因此只有「root 上移」到「部署修复」这两个 task 之间。

阶段 6 于是只剩纯去重：四份形状已经相同的 Dockerfile 合并成一份、四份 Caddyfile
合并成一份、四份 DEPLOY.md 的通用部分抽出来。

---

# 阶段 1：workspace root 上移 + 技术栈对齐

这一阶段不改任何业务代码。它必须在前，因为后面每一层共享包都要先有地方放。

## 1.1 为什么 root 必须上移

npm workspaces 靠 root 的 package.json 划范围：root 列出哪些子目录算 workspace，
npm 把它们互相符号链接进同一个 `node_modules`。现在 `black-and-white/package.json`
本身就是一个 root，只声明 `packages/*`，链接范围止于该目录。共享包要被四个游戏
import，必须落在同一链接范围内，所以 root 上移到 repo 根。

新的根 package.json：

```json
{
  "name": "twoplayergames",
  "private": true,
  "workspaces": [
    "platform/*",
    "black-and-white/packages/*",
    "flip-math/packages/*",
    "add-to-fifty/packages/*",
    "texas-poker/packages/*"
  ],
  "scripts": {
    "test": "npm test --workspaces --if-present",
    "check": "npm run check --workspaces --if-present",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

四个游戏目录的 `package.json` 删除（它们现在只有 `workspaces` 和一个 `test`
脚本，上移后两者都由根接管）。四个 `package-lock.json` 删除，根生成一份。

跟着失效的还有两处，容易漏：

- 四个 `<game>/.gitignore` 里的 `node_modules/` 规则指向的目录不再存在，删掉，
  保留各自的 dist 规则。
- `.claude/launch.json` 里四个 dev server 的 `runtimeArgs` 都带
  `"--prefix", "<game>"`，上移后该目录已没有 package.json，四个配置全起不来。
  去掉 `--prefix`，`--workspace` 参数不变。

## 1.2 为什么技术栈要在同一阶段对齐

root 上移后 npm 把四个游戏的依赖合并解析。现在两套版本并存：

| | texas-poker | 其余三个 |
| --- | --- | --- |
| svelte | 5.56.8 | 4.2.20 |
| vite | 8.2.0 | ^5.2.0 |
| vitest | 4.1.10 | ^1.6.0 |
| svelte-check | ^4.7.4 | ^3.6.0 |
| @sveltejs/vite-plugin-svelte | ^7.2.0 | ^3.1.0 |
| svelte-preprocess | ^6.0.5 | ^5.1.0 |

合并后 npm 必须把其中一套嵌套安装。嵌套能跑（今天 texas-poker 内部就已经把
`@sveltejs/vite-plugin-svelte` 嵌在 `packages/client/node_modules/` 下，
`vite build` 正常），但哪套被提到根取决于依赖方数量——现在 3 比 1，Svelte 4 胜。
加第五个游戏可能翻转，翻转时 texas-poker 会换成另一个大版本的编译器且不报错。
四个对齐则无此隐患。

## 1.3 对齐方向：升到 Svelte 5 / Vite 8 / Vitest 4

升级的改动量（已实测统计）：

- `createEventDispatcher`：三个 Svelte 4 游戏里共 1 处，在
  `black-and-white/packages/client/src/lib/Hand.svelte:9`，派发一个 `select` 事件。
  Svelte 5 legacy 模式仍支持，但改成回调 prop 更干净。
- 入口 API：三份 `main.ts` 的 `new App({ target })` 改为
  `mount(App, { target })`。texas-poker 已经是后者。
- `beforeUpdate`/`afterUpdate`、`<svelte:component>`、`let:` slot props、
  `transition:`/`animate:`、`use:` action、`$$props`/`$$restProps`/`$$slots`：
  三个游戏里各 0 处。

降级的改动量：texas-poker 的 svelte / vite / vitest / svelte-check
四个依赖各退一个大版本，还要处理 `mount()` 回退到 `new App()`。

选升级。

Svelte 5 legacy 语法可用的证据：texas-poker 的 `App.svelte` 有 500+ 行纯 legacy
写法（`export let`、`on:click`、`$:`），svelte-check 4 报 0 warnings。

Node 版本：Vite 8 要求 `^20.19.0 || >=22.12.0`；本机 v22.14.0，Docker 基镜像
`node:22-alpine`，都满足。

## 1.4 顺带清掉的依赖错位

texas-poker 的三个 package.json 里有装错位置的依赖，一并修正：

- `@texas-poker/client`：`vitest` 在 `dependencies`，应在 `devDependencies`
- `@texas-poker/server`：有 `svelte` 和 `vite` 依赖，server 不需要，删除
- `@texas-poker/shared`：同上，删除

## 1.5 阶段 1 验收

`npm test` 与 `npm run check` 在根跑通，151 个测试全过、四个 svelte-check
0 errors 0 warnings。业务代码零改动（除 1.3 列出的 4 处语法迁移）。

---

# 阶段 2：platform/protocol

## 2.1 内容

`ErrorCode` 在四份 `packages/shared/src/types.ts` 里一字不差，7 个成员顺序都一样；
`PlayerId` 与 `PLAYER_IDS` 同样。此外有一套会话层事件名和载荷，四个游戏都在收发，
但没有任何地方写成类型——只活在四份 `index.ts` 和四份 `socket.ts` 的字符串字面量里。

```ts
// platform/protocol/src/index.ts
export type PlayerId = "p1" | "p2";
export const PLAYER_IDS = ["p1", "p2"] as const;

export type ErrorCode =
  | "ALREADY_IN_ROOM"
  | "INVALID_REQUEST"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "INVALID_SESSION"
  | "INVALID_MOVE"
  | "OPPONENT_GONE";

export interface ErrorMsg {
  code: ErrorCode;
}

export interface RoomAccepted {
  roomCode: string;
  sessionToken: string;
}

/** 服务器 -> 客户端，会话层。玩法事件由各游戏自行定义。 */
export interface LobbyServerEvents {
  room_created: (d: RoomAccepted) => void;
  room_joined: (d: RoomAccepted) => void;
  error_msg: (e: ErrorMsg) => void;
  opponent_disconnected: () => void;
  opponent_reconnected: () => void;
  opponent_left: () => void;
}

/** 客户端 -> 服务器，会话层。 */
export interface LobbyClientEvents {
  create_room: () => void;
  join_room: (d: { roomCode: string }) => void;
  rejoin: (d: RoomAccepted) => void;
  leave_room: () => void;
}
```

`view_update` 不在这里：它的载荷是各游戏的 `ClientView`，类型由各游戏 shared 提供。
`createRoomSession` 用泛型接住。

## 2.2 各游戏的接入方式

每个游戏的 `packages/shared/src/types.ts` 删掉自己的 `PlayerId` / `ErrorCode` /
`ErrorMsg` 定义，改为 re-export：

```ts
export type { PlayerId, ErrorCode, ErrorMsg } from "@tpg/protocol";
export { PLAYER_IDS } from "@tpg/protocol";
```

这样游戏代码里所有 `import type { PlayerId } from "@bw/shared"` 一句不改。

## 2.3 阶段 2 验收

`npm test` + `npm run check` 全绿。四个游戏的 `ErrorCode` 只有一处定义。

---

# 阶段 3：platform/server

依赖阶段 2：下面三块都要引用 `ErrorCode` 和 `PLAYER_IDS`。

## 3.1 PresenceSession

**PresenceSession** 是一个抽象基类，只管连接状态——谁连着、谁掉线了、房间空了多久
——不碰任何玩法状态。它的 8 个方法来自两处：前 6 个（`addPlayer` 到 `isSweepable`）
在四份 `gameSession.ts` 里除缩进无差别，整段搬走；后 2 个（`findByToken`、
`bothConnected`）是从四份 `index.ts` 里重复出现的内联表达式提上来的——rejoin 时按
token 找玩家、rematch 时判双方是否都在线。

```ts
// platform/server/src/presenceSession.ts
import { type PlayerId } from "@tpg/protocol";

export interface Player {
  id: PlayerId;
  socketId: string | null; // null = 掉线
  sessionToken: string;
}

export abstract class PresenceSession {
  players: Partial<Record<PlayerId, Player>> = {};
  /** 房间最后一次归零连接的时刻；有人在线时为 null。驱动废弃房间回收。 */
  emptySince: number | null = null;

  addPlayer(id: PlayerId, socketId: string, sessionToken: string): void { ... }
  isFull(): boolean { ... }
  anyConnected(): boolean { ... }
  markConnected(id: PlayerId, socketId: string): void { ... }
  markDisconnected(id: PlayerId, now = Date.now()): void { ... }
  isSweepable(ttlMs: number, now = Date.now()): boolean { ... }
  findByToken(token: string): Player | undefined { ... }
  bothConnected(): boolean { ... }

  /** 房间被销毁前的清理。flip-math 在这里 clearTimer。 */
  onDispose?(): void;
}
```

各游戏的 `GameSession extends PresenceSession`，留下 `state`、`start()`、
`viewFor()` 和自己的动作方法。

## 3.2 RoomRegistry

四份 `rooms.ts` 的唯一差异是怎么 new 出 `GameSession`，所以改成泛型 + 工厂函数。

```ts
// platform/server/src/rooms.ts
export function makeRoomCode(): string;   // 6 位，字母表 ABCDEFGHJKLMNPQRSTUVWXYZ23456789
export function makeToken(): string;      // randomBytes(16).toString("hex")

export class RoomRegistry<S extends PresenceSession> {
  constructor(private createSession: () => S) {}
  create(): { roomCode: string; session: S };
  get(roomCode: string): S | undefined;
  delete(roomCode: string): void;          // 调用 session.onDispose?.()
  sweep(ttlMs: number, now?: number): string[];  // 同上
}
```

flip-math 现在比别人多的 `clearTimer()` 调用，由 `onDispose()` 覆写承接。

## 3.3 createGameServer

四份 `index.ts` 共 991 行，其中**五个** handler（`create_room`、`join_room`、
`rejoin`、`leave_room`、`disconnect`）加上 http server / socket.io /
定时扫房 / `close()` 的收尾是同一套；不同的只有各游戏自己的动作 handler。

**修正（2026-09-16，读完四份代码之后）**：原本把「重开一局」也算作第六个框架
handler，实际不行。black-and-white、flip-math、add-to-fifty 叫 `rematch`，
texas-poker 拆成 `next_hand` 和 `restart_match` 两个。三者共用的只有一道
guard——双方都在线，否则回 `OPPONENT_GONE`。所以它不是一个 handler，而是动作
定义上的一个开关 `requireBothConnected`，handler 各游戏自己写。

另一处修正：`PresenceSession` 要带一个由框架赋值的 `broadcast` 回调。
flip-math 的状态由计时器推进而不是 socket 事件推进，它的 session 在每次状态转移后
自己广播；原来这个回调是它在自己的 `index.ts` 里手工注入的，三个接入点各一次。
框架接过来之后，那三行从游戏代码里消失。

```ts
// platform/server/src/gameServer.ts
export interface ActionCtx<S extends PresenceSession> {
  session: S;
  playerId: PlayerId;
  socket: Socket;
  /** 给房内每个在线玩家发自己的 view_update。 */
  broadcastViews(): void;
  /** 按玩家裁剪的自定义广播，make 返回 null 则不发。 */
  broadcastPerPlayer<T>(event: string, make: (id: PlayerId) => T | null): void;
  fail(code: ErrorCode): void;
}

export interface GameServerOptions<S extends PresenceSession> {
  createSession: () => S;
  /** 第二名玩家加入、以及 rematch 时调用。抛硬币定先手之类的写在这里。 */
  onStart: (session: S) => void;
  /** 「局还在进行中」——决定 leave_room 要不要给对手判胜。 */
  isInProgress: (session: S) => boolean;
  /** 游戏自己的动作事件。key 是 socket 事件名。 */
  actions: Record<string, (ctx: ActionCtx<S>, data: unknown) => void>;
  /** rejoin 成功后的补发。black-and-white 在这里补 game_over。 */
  onRejoin?: (ctx: ActionCtx<S>) => void;
  roomTtlMs?: number;        // 默认 10 分钟
  sweepIntervalMs?: number;  // 默认 60 秒
}

export function createGameServer<S extends PresenceSession>(
  opts: GameServerOptions<S>,
): (port: number) => Promise<{ port: number; close: () => Promise<void> }>;
```

`isInProgress` 存在的原因：black-and-white 判 `phase === "playing"`，
add-to-fifty 判 `phase !== "finished"`，两者语义相同但 phase 名字不同。

`broadcastPerPlayer` 存在的原因：black-and-white 在局终要给双方各发一份
`game_over`（`session.reviewFor(id)`），其余三个游戏没有这个事件。放进通用层会变成
特例判断，所以做成工具方法，由 black-and-white 自己的 `play_card` handler 调用。

CORS 策略（生产同源 `origin: false`、开发 `*`、`CORS_ORIGIN` 覆盖）也搬进来，
四份实现一致。

## 3.4 迁移顺序

一个游戏一次，每次跑全量测试：black-and-white（有 review 广播，压力最大）→
add-to-fifty → texas-poker → flip-math（有计时器，用 `onDispose`）。

## 3.5 阶段 3 验收

每个游戏迁完后 `npm test` 全绿。四个游戏的 `index.ts` 只剩自己的动作 handler。

---

# 阶段 4：platform/client

依赖阶段 2（事件类型）。与阶段 3 无依赖，可并行，但按顺序做更容易定位问题。

## 4.1 createRoomSession

四份 `socket.ts` 的会话管线一致：stores、`rejoining` 标志、`onRoomAccepted`、
`error_msg` 里对静默重连失败的丢弃、三个 `opponent_*` handler、
`createRoom`/`joinRoom`/`tryRejoin`/`leaveRoom`。差异是 localStorage 的 key 前缀、
额外的 emit 函数、收到新视图时的副作用。

```ts
// platform/client/src/roomSession.ts
export interface RoomSessionOptions<V> {
  /** localStorage key 前缀。必须沿用各游戏现有值。 */
  storagePrefix: string;
  /** 每次 view_update 之后的游戏自定义副作用。 */
  onView?: (view: V) => void;
  /** leaveRoom 时的额外清理。 */
  onLeave?: () => void;
}

export function createRoomSession<V extends { phase: string }>(
  opts: RoomSessionOptions<V>,
): {
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
};
```

`StatusCode` 与 `EndedCode` 定义在同包的 `dict.ts`（见 4.3）。

各游戏用法：

```ts
// black-and-white/packages/client/src/socket.ts
export const review = writable<GameReview | null>(null);

const session = createRoomSession<ClientView>({
  storagePrefix: "bw",
  onView: (v) => {
    // 新的 playing 视图说明开了新局（rematch），清掉终局界面
    if (v.phase === "playing") { review.set(null); }
  },
  onLeave: () => review.set(null),
});

export const { view, roomCode, status, ended, createRoom, joinRoom, tryRejoin, leaveRoom } = session;
export const playCard = (card: number) => session.emit("play_card", { card });

session.socket.on("game_over", (r: GameReview) => review.set(r));
```

### 必须守住的约束：key 前缀不变

四个游戏现有的 localStorage key：

| 游戏 | key |
| --- | --- |
| black-and-white | `bw_token` / `bw_room` |
| flip-math | `fm_token` / `fm_room` |
| add-to-fifty | `add2fifty_token` / `add2fifty_room` |
| texas-poker | `texas_poker_token` / `texas_poker_room` |

前缀一改，玩家浏览器里存着的 session token 就对不上，上线那一刻所有人正在打的局
被踢回大厅。`storagePrefix` 传 `"bw"` / `"fm"` / `"add2fifty"` / `"texas_poker"`，
拼接规则保持 `` `${prefix}_token` `` 和 `` `${prefix}_room` ``。

### 顺带统一的一处行为

texas-poker 的 `view_update` handler 里多一句 `status.set(null)`，另外三个没有。
这行是对的——收到新视图说明连接正常，该清掉旧报错——四个都采用。

## 4.2 createI18n

i18n 分两半。引擎那半（`resolveLang`、`lang` store、`toggleLang`、派生 `t`、
把语言写进 `document.documentElement.lang` 和 `document.title`）四份一致。

```ts
// platform/client/src/i18n.ts
export type Lang = "en" | "zh";

/** 纯函数，不依赖 DOM，便于测试。英文是 fallback。 */
export function resolveLang(saved: string | null, navigatorLang: string): Lang;

export function createI18n<D extends { title: string }>(opts: {
  storageKey: string;
  dict: Record<Lang, D>;
}): { lang: Writable<Lang>; t: Readable<D>; toggleLang(): void };
```

`storageKey` 同样沿用现有值（`bw_lang` / `fm_lang` / `add2fifty_lang` /
`texas_poker_lang`），理由同 4.1。

## 4.3 共享词条

`status` 下的 8 条报错文案四份一致，因为它们对应的正是阶段 2 那个逐字相同的
`ErrorCode`（7 个）加上本地通知 `OPPONENT_DISCONNECTED`。`ended.OPPONENT_LEFT`
同样。大厅那一组 key 因为阶段 5 要共享 `Lobby` 组件，也必须固定下来。

```ts
// platform/client/src/dict.ts
export type StatusCode = ErrorCode | "OPPONENT_DISCONNECTED";
export type EndedCode = "OPPONENT_LEFT";

/** 共享 Lobby 组件要求的词条形状。各游戏 dict 必须满足。 */
export interface LobbyDict {
  createRoom: string;
  closeRoom: string;
  confirmClose: string;
  cancel: string;
  roomCode: string;
  waitingOpponent: string;
  codePlaceholder: string;
  join: string;
}

export const sharedDict: Record<Lang, {
  status: Record<StatusCode, string>;
  ended: Record<EndedCode, string>;
  lobby: LobbyDict;
}>;
```

各游戏的 dict 合并共享词条，并按需覆盖单条（black-and-white 的
`waitingOpponent` 现在写的是「发给朋友，等待对手加入…」，保留这句）。

## 4.4 assertDictParity

四份 `i18n.test.ts` 共 237 行，彼此只差一行。它做的是 **parity check**：
断言中英两份词典形状一致（同样的 key 树、同样的函数 arity），并且没有 zh 条目
原样等于 en 条目（漏翻）；`SHARED_BY_DESIGN` 列出有意相同的 key
（texas-poker 的 `title` 是英文产品名，中文界面里也保持英文）。

```ts
// platform/client/src/testing.ts
export function assertDictParity<D>(
  en: D,
  zh: D,
  opts?: { sharedByDesign?: string[] },
): void;
```

各游戏的 `i18n.test.ts` 缩成一次调用加自己的 `SHARED_BY_DESIGN`。

## 4.5 阶段 4 验收

`npm test` + `npm run check` 全绿。手工确认一次：在四个游戏各建一个房间，
刷新页面，局应当恢复（验证 key 前缀没变）。

---

# 阶段 5：token 契约 + platform/ui

依赖阶段 4：共享组件要用 `createRoomSession` 的 store 和 `createI18n` 的 `t`。

## 5.1 为什么"传 style"能替代 slot

Tailwind v4 扫描项目源码，找出出现过的 class 名，再按 `@theme` 块里声明的 CSS
变量生成对应规则。所以一个 class 名值多少，由**使用它的项目**的 `@theme` 决定，
不由写组件的人决定。共享组件写 `bg-surface`，四个游戏在各自 `theme.css` 里把
`--color-surface` 定成不同的值，同一份组件长出四种样子。

`@theme` 的作用域不止颜色：`--radius-*` 生成 `rounded-*`，`--shadow-*` 生成
`shadow-*`，`--tracking-*` 生成 `tracking-*`。所以圆角、阴影、字距也能各游戏各定。

已用 Tailwind 4.3.1 实测（一次性工程，已删除），下列六个工具类全部按 token 生成：

```
.rounded-panel{border-radius:var(--radius-panel)}
.bg-surface{background-color:var(--color-surface)}
.text-ink{color:var(--color-ink)}
.shadow-panel{--tw-shadow:0 8px 40px var(--tw-shadow-color,#00000080);...}
.tracking-title{letter-spacing:var(--tracking-title)}
.text-accent{color:var(--color-accent)}
```

## 5.2 token 契约

**token 契约**指一组固定的名字，四个游戏都必须在自己的 `theme.css` 的 `@theme`
块里给这组名字赋值。共享组件只写这些名字，不写具体颜色或像素。

| token | 用途 |
| --- | --- |
| `--color-surface` | 面板底色 |
| `--color-ink` | 面板上的主文字 |
| `--color-muted` | 次要文字（说明、标签） |
| `--color-accent` | 强调：标题、房间码、主按钮底 |
| `--color-accent-ink` | 主按钮上的文字 |
| `--color-line` | 描边与分隔线 |
| `--color-danger` | 报错文字与危险按钮 |
| `--radius-panel` | 面板圆角 |
| `--radius-control` | 按钮/输入框圆角 |
| `--shadow-panel` | 面板阴影 |

现状：flip-math、add-to-fifty、texas-poker 已有 `panel`/`ink`/`muted`/`line`/
`accent` 这一套；black-and-white 一个都没有，它用的是 `felt`/`gold`/`felt-text`/
`gold-muted`/`btn-*`。所以 black-and-white 补的是别名，指向它已有的颜色：

```css
/* black-and-white/packages/client/src/theme.css，追加 */
@theme {
  --color-surface: #1d4d36;      /* = --color-felt */
  --color-ink: #f3ead2;          /* = --color-felt-text */
  --color-muted: #cbb98a;        /* = --color-gold-muted */
  --color-accent: #d9b25b;       /* = --color-gold */
  --color-accent-ink: #3a2c08;   /* = --color-btn-primary-text */
  --color-line: rgba(217, 178, 91, 0.2);
  --radius-panel: 20px;
  --radius-control: 8px;
  --shadow-panel: 0 8px 40px rgba(0, 0, 0, 0.5);
}
```

值取自现有 markup 里的字面量，所以像素不变。另外三个游戏同样对照自己现有的
`Lobby.svelte` 取值。`--color-danger` 四个游戏都已有（black-and-white 的 status
文字现在用 `text-lose` #e57373，`--color-danger` 是 #c0392b；改用 danger 会让
大厅报错从浅红变深红，接受）。

## 5.3 Tailwind 扫不到共享包 —— 必须加 @source

Tailwind 的源码扫描默认跳过 `node_modules`，而 `platform/ui` 正是通过
`node_modules` 里的 workspace 符号链接被引用的。后果是只在共享组件里出现过的
class 一个都不生成，**而且构建不报错**——浏览器里组件没有样式。

实测确认：把 `@source` 那行删掉重新构建，5.1 里列的规则全部消失，vite 正常退出。

每个游戏的 `theme.css` 顶部加一行：

```css
@import "tailwindcss";
@source "../../../../platform/ui/src";
```

（相对路径从 `<game>/packages/client/src/` 数到 repo 根的 `platform/ui/src`。）

## 5.4 共享组件

### Button

四份实现的 variant 名字不一致：black-and-white 是 `primary | ghost | danger`，
add-to-fifty 和 texas-poker 是 `primary | secondary | danger`。统一成四个：
`primary | secondary | ghost | danger`，全部走 token。

```svelte
<script lang="ts">
  export let variant: "primary" | "secondary" | "ghost" | "danger" = "primary";
  export let type: "button" | "submit" = "button";
  export let disabled = false;
  let extra = "";
  export { extra as class };
</script>
```

`class` 透传保留（black-and-white 现在用它传 `w-full`）。

### LangToggle

四份只差 Button 的 variant（两个用 `ghost`，两个用 `secondary`）。统一用
`ghost`，`fixed right-3 top-3 z-50` 的定位不变。

### Lobby

一份结构，token 上色。结构取四个游戏的并集：

```
标题
副标题（空字符串则不渲染 —— flip-math 没有副标题）
[ 已建房 ]                    [ 未建房 ]
  房间码大字                    [创建房间]
  等待对手提示                   [______] [加入]
  [解散房间] → 二次确认
status 提示行
```

有三处差异是行为而非样式，token 管不了，统一处理：

| 差异 | 现状 | 决定 |
| --- | --- | --- |
| 解散房间二次确认 | 只有 flip-math 有 | 四个都加。房里可能已有对手在等，另外三个现在一点即拆 |
| 「加入」可点条件 | bw 要求正好 6 位；a2f/tp 只要非空 | 统一成 `code.trim()` 长度等于 6。`makeRoomCode` 固定生成 6 位，提前挡住比发出去再收 `ROOM_NOT_FOUND` 干净。提交时仍按现有写法 `code.trim().toUpperCase()` 规整 |
| 输入框 placeholder | texas-poker 用的是 `copy.roomCode`（显示成 "Room code"） | 改用 `lobby.codePlaceholder`，这是写错了 |

## 5.5 platform/build：vite config 与 tsconfig

四份 `vite.config.ts` 里三份逐字相同，第四份只差换行。抽成一个工厂：

```ts
// platform/build/src/viteConfig.ts
export function gameViteConfig(opts?: { port?: number }): UserConfig;
```

各游戏的 `vite.config.ts` 缩成两行。dev server 的 `/socket.io` 代理规则
（`target: http://localhost:3001, ws: true`）也在里面。

单独开 `platform/build` 而不放进 `platform/ui`，原因是这个工厂要把 `vite`、
`@sveltejs/vite-plugin-svelte`、`svelte-preprocess`、`@tailwindcss/vite`
列为依赖；`platform/ui` 是运行时组件包，不该背构建工具的依赖。

`tsconfig.json` 四份是模板，抽成 `platform/build/tsconfig.base.json`，
各游戏 `extends`。

## 5.6 阶段 5 验收

`npm test` + `npm run check` 全绿。四个游戏各起 dev server 截图比对大厅：
除 5.2 说明的 black-and-white status 文字颜色和 5.4 表格里的三处行为变更外，
其余像素不变。

---

# 阶段 6：部署

依赖阶段 5：源码结构定了才能定 COPY 哪些路径。

## 6.1 build context 上移

四个 compose 现在写 `context: .`，Docker 只把游戏目录打进构建上下文；
`platform/` 在 repo 根下，构建时 COPY 不到。所以：

```yaml
# black-and-white/docker-compose.yml
services:
  bw-server:
    build:
      context: ..                       # repo 根
      dockerfile: platform/deploy/Dockerfile
      target: server
      args:
        GAME_DIR: black-and-white
        SCOPE: "@bw"
```

## 6.2 Dockerfile 合并成一份

四份 `Dockerfile` 各自只差 workspace scope 名（`@bw` / `@fm` /
`@add-to-fifty` / `@texas-poker`）。合并成 `platform/deploy/Dockerfile`，
scope 与游戏目录名由 `ARG` 传入。

npm ci 的缓存层要保住，所以先只 COPY package.json 类文件再 `npm ci`。
`platform/*` 的 package.json 数量固定，直接列出；游戏目录名由 `ARG` 给：

```dockerfile
# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
ARG GAME_DIR
WORKDIR /app
COPY package.json package-lock.json ./
COPY platform/protocol/package.json ./platform/protocol/
COPY platform/server/package.json ./platform/server/
COPY platform/client/package.json ./platform/client/
COPY platform/ui/package.json ./platform/ui/
COPY platform/build/package.json ./platform/build/
COPY ${GAME_DIR}/packages/shared/package.json ./${GAME_DIR}/packages/shared/
COPY ${GAME_DIR}/packages/server/package.json ./${GAME_DIR}/packages/server/
COPY ${GAME_DIR}/packages/client/package.json ./${GAME_DIR}/packages/client/
RUN npm ci

FROM deps AS client-build
ARG GAME_DIR
ARG SCOPE
COPY platform ./platform
COPY ${GAME_DIR}/packages/shared ./${GAME_DIR}/packages/shared
COPY ${GAME_DIR}/packages/client ./${GAME_DIR}/packages/client
RUN npm run build --workspace ${SCOPE}/client

FROM caddy:2-alpine AS web
ARG GAME_DIR
COPY --from=client-build /app/${GAME_DIR}/packages/client/dist /srv
COPY platform/deploy/Caddyfile /etc/caddy/Caddyfile

FROM node:22-alpine AS server
ARG GAME_DIR
ARG SCOPE
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
# CMD 要在运行时用到 SCOPE，而 ARG 只存在于构建期，所以固化成 ENV
ENV SCOPE=${SCOPE}
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY platform ./platform
COPY ${GAME_DIR}/packages/shared ./${GAME_DIR}/packages/shared
COPY ${GAME_DIR}/packages/server ./${GAME_DIR}/packages/server
EXPOSE 3001
# shell 形式，让 ${SCOPE} 被展开；exec 形式不做变量替换
CMD npm run start --workspace ${SCOPE}/server
```

两个 `ARG` 在每个 stage 里都要重新声明——`ARG` 的作用域止于所在 stage，
这是 Dockerfile 的规则，漏一个会展开成空字符串。

代价：根 `package-lock.json` 里任何一个游戏改依赖，四个镜像的 deps 层都失效。
接受——部署手动触发，不是 CI 每次跑。

## 6.3 web/Caddyfile 合并成一份

四份只差反代目标主机名（`bw-server:3001` 等）。Caddy 支持 `{$ENV_VAR}` 占位，
所以合并成 `platform/deploy/Caddyfile`，compose 里传环境变量：

```
:80 {
	encode gzip
	handle /socket.io/* {
		reverse_proxy {$GAME_SERVER}
	}
	handle {
		root * /srv
		try_files {path} /index.html
		file_server
	}
}
```

## 6.4 docker-compose.yml 保留四份

它和上面两个的区别是人要直接敲它（`cd black-and-white && docker compose up -d`）。
每个游戏留一个部署入口比一份 compose 配四个 `--env-file` 好记。

`proxy/Caddyfile` 不变——四个 hostname 块和 `*-web` 服务名都没动。

## 6.5 DEPLOY.md

四份 `DEPLOY.md` 共 239 行讲同一套步骤。通用步骤搬到
`platform/deploy/README.md`，各游戏 `DEPLOY.md` 缩成自己的域名、服务名、
`ARG` 取值，并链到通用文档。

## 6.6 阶段 6 验收

四个游戏各跑一次 `docker compose build`，构建成功。`docker compose up -d` 后
访问各自域名，能建房、能双人对局。

---

# 阶段 7：重写 CLAUDE.md

项目 `CLAUDE.md`（以及内容相同的 `AGENTS.md`）现在写的是每个游戏自包含、
「只实现你的游戏需要的功能」。阶段 1–6 做完后这套说法和代码矛盾，下一个 session
会按它把 `platform/*` 判为违规。必须在同一批改动里改掉。

要改的点：

1. **目录结构**一节加 `platform/`，说明四个包各管什么。
2. **架构标准**一节：把「每个游戏文件夹内是一个 npm workspaces monorepo」改成
   「repo 根是唯一 workspace root」，并区分两类代码——会话/大厅/i18n 这类基础设施
   走 `platform/*`，玩法逻辑仍各游戏独立。
3. **技术栈**一节：Svelte 4 + Vite 5 改成 Svelte 5 + Vite 8 + Vitest 4。
4. **样式标准**一节：加 token 契约那 10 个名字，加 `@source` 那一行的必要性
   （漏了不报错只是组件没样式）。
5. **测试标准**一节：加 platform 自己的测试要求，并写明各游戏的服务器权威性回归
   保留不删。
6. **部署契约**一节：`Dockerfile`/`Caddyfile` 从「复制四个文件」改成「加一个
   compose 加 `ARG`」。
7. **新游戏 checklist** 按上述重写。
8. 「只实现你的游戏需要的功能」这条保留，但限定到玩法：不要因为别的游戏有某个
   玩法机制就照搬；基础设施相反，应当复用 `platform/*`。
9. 「不要替用户 commit」这条和用户全局 `CLAUDE.md` 的「committing is fine」
   直接冲突，agent 每次都得判一次哪条优先。删掉项目这条，由全局那条统一管——
   全局规则同时禁止 `git push`，所以删掉不会导致代码被推上去。

`AGENTS.md` 与 `CLAUDE.md` 内容相同，同步更新。

---

# platform 的测试

每个 platform 包要有自己的测试，其中一条是跨游戏回归：用 `createGameServer`
起一个最小假游戏（状态就是一个计数器），两个 socket.io-client 跑完整流程——
建房、加入、动作、断线、重连、离开——并断言服务器权威性：

- 伪造的 `sessionToken` rejoin 被拒（`INVALID_SESSION`）
- 非当前玩家发动作被拒
- 第三个 socket 加入已满房间被拒（`ROOM_FULL`）
- 空房间超过 TTL 被 `sweep` 回收

四个游戏各自的服务器权威性回归**保留不删**。platform 测的是通用管线，
游戏测的是自己的规则判定，两者不能互相替代。

`platform/client` 的测试覆盖 `resolveLang`（纯函数）和 `assertDictParity`
自身（给它一对故意漏翻的词典，断言它报错）。

# 不做的事

- 不抽各游戏的 `packages/shared`（规则引擎）。玩法逻辑各自独立，这是本 repo 的
  前提，不在这次改动范围内。
- 不抽玩法 UI（`Table`、`Board`、`Hand`、`PlayingCard` 等）。`PlayingCard`
  在 add-to-fifty 和 texas-poker 里看着像，但一个要画 King 的可变点数、一个要画
  翻面动画，共享会立刻变成条件分支。等第三个游戏也要扑克牌时再看。
- 不引入隐藏信息裁剪的通用层。black-and-white 和 texas-poker 有机密状态，
  flip-math 和 add-to-fifty 没有，裁剪规则和玩法绑死，`viewFor()` 留在各游戏。
- 不动 `proxy/`。
