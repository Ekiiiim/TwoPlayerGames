# TwoPlayerGames — repo 范式与要求（给 agent 看）

本 repo 托管多个**并列的双人在线小游戏**。它们是**兄弟关系**：**基础设施共用同一份实现**
（在 `platform/*`，不是各自复制一遍），但玩法、状态模型、是否有隐藏信息**相互独立**。

这一条是本 repo 最容易搞错的地方，所以说清楚：

- **基础设施要复用，不要再写一遍。** 房间与会话、大厅界面、语言切换、按钮、vite 与
  tsconfig、Dockerfile 与 Caddyfile —— 这些都只有一份，在 `platform/*`。给新游戏加这些
  东西的正确做法是 import，不是复制。
- **玩法要独立，不要因为别的游戏有就照搬。** 规则引擎、状态模型、玩法 UI、隐藏信息裁剪
  —— 这些各游戏自己写。隐藏信息裁剪只对**有机密状态**的游戏才需要（black-and-white 和
  texas-poker 有，flip-math 和 add-to-fifty 没有），没有就不要加。

需要具体写法时参考任一已有游戏（如 `black-and-white/`），但按上面两条分清你抄的是哪一类。

## 目录结构

```
proxy/                共享反向代理（每台 droplet 一个；占用 80/443，自动 TLS）
platform/             跨游戏基础设施 —— 五个 npm 包加一份部署配置
  protocol/           @tpg/protocol  会话层线协议：PlayerId / ErrorCode / RoomAccepted
  server/             @tpg/server    PresenceSession / RoomRegistry / createGameServer
  client/             @tpg/client    createRoomSession / createI18n / 共享词条 / 词典 parity check
  ui/                 @tpg/ui        Button / LangToggle / Lobby，只写 ui-* token
  build/              @tpg/build     vite config 工厂 + tsconfig.base.json
  deploy/             Dockerfile + Caddyfile + README，四个游戏共用
black-and-white/      一个已有游戏（可作示例）
  packages/{shared,server,client}
  docker-compose.yml  部署入口 —— 这是每个游戏唯一保留一份的部署文件
  DEPLOY.md           只有自己的域名和三个取值
<new-game>/           每个游戏一个文件夹
docs/superpowers/     spec 与实施计划
```

## Workspace

**repo 根是唯一的 workspace root。** 根 `package.json` 的 `workspaces` 覆盖
`platform/*` 和四个游戏的 `packages/*`，全仓库一份 `package-lock.json`。游戏目录下
**没有** `package.json`，也没有自己的 lockfile。

`npm install` 一律在 repo 根跑。`npm ≥ 11` —— npm 10.9.2 的 arborist 在这个 workspace
规模下会崩（`Cannot read properties of null (reading 'edgesOut')`，在 `#loadPeerSet` 里）。
同理**不要给 `platform/*` 的包加 `peerDependencies`**，那个 bug 就在 peer set 的加载路径上。
镜像里的 npm 10 不用动：已验证它的 `npm ci` 能吃 npm 11 生成的 lockfile。

## 每个游戏的架构标准

每个游戏三个包：

- `packages/shared` — 纯 TS：类型 + 规则引擎，**无 IO**。前后端共用同一份逻辑。
- `packages/server` — Node + Socket.IO，**权威方**。真实状态只存服务器内存。
- `packages/client` — Svelte + Vite + TS。

**服务器**不再自己写 socket 事件入口，而是喂一份配置给 `createGameServer`：

```ts
import { createGameServer } from "@tpg/server";

const makeServer = () =>
  createGameServer<GameSession>({
    createSession: () => new GameSession(),
    onStart: (ctx) => {
      ctx.session.start();
      ctx.broadcastViews();
    },
    isInProgress: (s) => s.state !== null && s.state.phase !== "finished",
    actions: {
      play_card: (ctx, data) => {
        /* 玩法动作 */
      },
      // 「重开一局」这类动作要求双方在线,否则回 OPPONENT_GONE
      rematch: {
        requireBothConnected: true,
        handler: (ctx) => ctx.session.start(),
      },
    },
  });

export async function startServer(port: number) {
  return makeServer()(port);
}
```

`create_room` / `join_room` / `rejoin` / `leave_room` / `disconnect` 五个会话层事件由框架
处理，不要在游戏里重写。`GameSession extends PresenceSession<GameState, ClientView>`，
游戏只实现 `viewFor(id)` 和自己的状态转移；连接状态、房间回收、按玩家裁剪的广播都在基类里。
状态由计时器推进的游戏在转移后调 `this.broadcast?.()` 自己推视图（见 `flip-math`）。

**客户端**的会话管线和 i18n 引擎同样不要重写：

```ts
// packages/client/src/socket.ts
const session = createRoomSession<ClientView>({ storagePrefix: "xx" });
export const {
  view,
  roomCode,
  status,
  ended,
  createRoom,
  joinRoom,
  tryRejoin,
  leaveRoom,
} = session;
export const playCard = (card: number) => session.emit("play_card", { card });

// packages/client/src/i18n.ts
export const { lang, t, toggleLang } = createI18n({
  storageKey: "xx_lang",
  dict,
});
```

`storagePrefix` 和 `storageKey` 一旦上线就不能改：玩家浏览器里存着的 `${prefix}_token`
对不上，上线那一刻所有正在打的局被踢回大厅。

**通用核心原则：**

- **服务器权威**：所有结算、计时、判定都在服务器；客户端只发意图，不能伪造结果或越权。
- `shared/*` 是纯函数（`state + action -> new state`，无 IO、无真实时钟），前后端复用。
- 状态纯内存、无数据库；房间码配对；`sessionToken` 存 localStorage 用于 `rejoin`。
- 空房间有 TTL 清扫（框架已做）。

## 技术栈（无充分理由不要偏离）

Svelte 5 + Vite 8 ｜ **Tailwind CSS v4**（`@tailwindcss/vite`）｜ Socket.IO 4 ｜
Node 22 + TS 5（生产用 `tsx` 直跑 TS，不编译）｜ Vitest 4 ｜ npm ≥ 11

**Svelte 5 跑在 legacy 模式**：四个 client 各有一份 `svelte.config.js` 写死
`compilerOptions: { runes: false }`。删掉它，5.57+ 默认按 runes 编译，`$t` 这种 store
自动订阅会报 `` `$t` is an illegal variable name ``。组件写法也因此保持 legacy：
`export let` 声明 props、`on:click` 转发、`<slot />`。

四个 client 的 `tsconfig.json` 靠 `extends "@tpg/build/tsconfig.base.json"`，里面开了
`verbatimModuleSyntax`（`svelte-check` 4.7+ 要求），所以类型导入一律写 `import type`。

`vite.config.ts` 是两行，调 `gameViteConfig({ port })`。`@tpg/build` 的那个工厂是 **JS
不是 TS**：vite 加载 `vite.config.ts` 时把 bare import 留成 external，node 拿到 `.ts`
会报 `ERR_UNKNOWN_FILE_EXTENSION`。类型由手写的 `.d.ts` 提供。

## 样式标准（Tailwind v4）

- 用 `@tailwindcss/vite` 插件。设计 token 集中在 `src/theme.css` 的 `@theme` 块
  （`--color-*` / `--font-*` 会自动生成 `bg-*` / `text-*` / `border-*` 工具类）；
  页面级背景放 `@layer base`，reset 交给 preflight，不要自己写。
- **共享组件的 token 契约**：`@tpg/ui` 里的组件只写这 10 个名字，每个游戏必须在自己的
  `theme.css` 里给它们赋值，值可以用 `var()` 指向本游戏已有的颜色。

  | token                   | 用途                   |
  | ----------------------- | ---------------------- |
  | `--color-ui-surface`    | 面板底色               |
  | `--color-ui-ink`        | 面板上的主文字         |
  | `--color-ui-muted`      | 次要文字               |
  | `--color-ui-accent`     | 标题、房间码、主按钮底 |
  | `--color-ui-accent-ink` | 主按钮上的文字         |
  | `--color-ui-line`       | 描边与分隔线           |
  | `--color-ui-danger`     | 报错文字与危险按钮     |
  | `--radius-ui-panel`     | 面板圆角               |
  | `--radius-ui-control`   | 按钮 / 输入框圆角      |
  | `--shadow-ui-panel`     | 面板阴影               |

  前缀 `ui-` 不能去掉。裸名会和游戏自己的调色板撞车：texas-poker 的 `--color-ink` 是
  近黑色（给奶油色牌面用的），而它的大厅面板是绿毡配奶油字，两者含义相反。

- **`theme.css` 必须有 `@source "../../../../platform/ui/src";`。** Tailwind 默认不扫
  `node_modules`，而 `@tpg/ui` 是符号链接进来的。漏了这行，共享组件的 class 一条都不生成
  —— **而且构建成功、没有任何警告**，浏览器里组件一点样式都没有。
- 组件里直接用工具类；精确像素/阴影用 arbitrary value（如 `rounded-[20px]`），颜色一律走
  token 工具类。
- 重复的 UI 抽成共享组件。**跨游戏重复的抽到 `@tpg/ui`**，只在本游戏内重复的放
  `packages/client/src/lib/`。
- 尽量不写 scoped `<style>`。

## 测试标准

- `platform/*`：每个包有自己的测试。`@tpg/server` 里有一条跨游戏回归——用
  `createGameServer` 起一个最小假游戏（状态就是一个计数器），两个 socket.io-client 跑完
  建房 / 加入 / 动作 / 断线 / 重连 / 离开，并断言服务器权威性（伪造 token 被拒、满房被拒、
  空房超 TTL 被回收）。
- `shared/`：规则引擎做充分单元测试（TDD 核心区）。
- `server/`：两个 socket.io-client 跑完整一局的集成测试，**并保留各游戏自己的服务器权威性
  回归**——platform 测的是通用管线，游戏测的是自己的规则判定，两者不能互相替代。
  **有隐藏信息的游戏**再加一条防泄露回归，断言机密状态从不出现在任何下发消息里。
- `client/`：轻量。词典用 `assertDictParity(dict.en, dict.zh)` 一句话断言中英形状一致、
  没有漏翻；有意中英同字的 key 列进 `sharedByDesign`。
- **客户端改动只有浏览器能判对错。** `svelte-check` 抓不到运行时的接线错误（它对
  Svelte 4 写法的 `new App(...)` 报 0 error，而那在 Svelte 5 下必崩），Tailwind 漏
  `@source` 也不报错。改完 client 必须起 dev server 真打一局。
- 完成前必须 `npm test`（全仓库）+ `npm run check`（四个 client）全绿。当前基线 **214**：

  | 区域                            | 个数              |
  | ------------------------------- | ----------------- |
  | `@tpg/{protocol,client,server}` | 5 / 38 / 40       |
  | 四个 `shared`                   | 20 / 37 / 11 / 17 |
  | 四个 `server`                   | 19 / 9 / 6 / 8    |
  | 四个 `client`                   | 1 × 4             |

## 部署契约

一个共享 `proxy/`；**Dockerfile 和 Caddyfile 各只有一份**，在 `platform/deploy/`，靠
`ARG` 和环境变量区分游戏。每个游戏只保留一份 `docker-compose.yml` 当入口。

**为新游戏加部署，只需：**

1. 复制一份现有游戏的 `docker-compose.yml`，改掉 `name`、两个服务名、两个镜像名，以及
   三个取值：

   | 名字          | 例                | 在哪儿用                                          |
   | ------------- | ----------------- | ------------------------------------------------- |
   | `GAME_DIR`    | `black-and-white` | build `args`，决定 COPY 哪些路径                  |
   | `SCOPE`       | `"@bw"`           | build `args`，决定 `npm run --workspace` 跑哪个包 |
   | `GAME_SERVER` | `bw-server:3001`  | `*-web` 的 `environment`，Caddy 的反代目标        |

   `SCOPE` 在 YAML 里**必须加引号**，`@` 是 YAML 的保留指示符。

2. `*-server` 仅内网（`expose: 3001`，不 publish）；`*-web` 是 Caddy，服务静态客户端并把
   `/socket.io/` 反代到 server。
3. 在 `proxy/Caddyfile` 加**一个块**：`yourgame.minyu.me { reverse_proxy xx-web:80 }`，
   然后**重建**代理容器：`cd proxy && docker compose up -d --force-recreate caddy`
   （Caddyfile 是单文件挂载、绑在旧 inode 上，`reload`/`restart`/普通 `up -d` 都读不到改动）。
4. 客户端用 `io()` 同源连接；`CORS_ORIGIN` 环境变量可覆盖（生产默认同源）。

细节（droplet 一次性设置、构建上下文为什么是 repo 根、`/socket.io/` 不通时怎么查）见
[`platform/deploy/README.md`](platform/deploy/README.md)。

本地已有同名镜像时 **`docker compose up -d` 不会重建**，会拿旧镜像糊弄过去。验证改动要用
`docker compose up -d --build`。

## 新游戏 checklist

- [ ] 在根 `package.json` 的 `workspaces` 加 `<new-game>/packages/*`
- [ ] 搭出 `packages/{shared,server,client}` 与各自 package.json/tsconfig
      （client 的 tsconfig `extends "@tpg/build/tsconfig.base.json"`）
- [ ] 先写 `shared` 的类型 + 纯函数规则引擎，配单元测试
- [ ] `server`：`GameSession extends PresenceSession`，只实现 `viewFor` 和状态转移；
      入口喂 `createGameServer`。带服务器权威性回归测试（含隐藏信息的再加防泄露回归）
- [ ] `client`：`createRoomSession` + `createI18n`；`theme.css` 里写 10 个契约 token
      和那行 `@source`；大厅直接用 `@tpg/ui` 的 `Lobby`
- [ ] `svelte.config.js` 写 `compilerOptions: { runes: false }`
- [ ] 复制一份 `docker-compose.yml`，改三个取值；在 `proxy/Caddyfile` 加一行
- [ ] `npm test` + `npm run check` 全绿，并在浏览器里真打一局

## 约定

- **基础设施复用，玩法独立。** 见开头那两条。
- 有隐藏/机密状态时留在服务器端，并补一条证明「未泄露」的回归测试；没有就不必。
- 注释解释 **为什么**，不是 **是什么**。
- commit 的规矩由用户全局 `~/.claude/CLAUDE.md` 统一管，本文件不再重复一份可能冲突的说法。
