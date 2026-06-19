# TwoPlayerGames — repo 范式与要求（给 agent 看）

本 repo 托管多个**并列的双人在线小游戏**。它们是**兄弟关系**：共用同一套**基础架构与部署方式**，
但各自的玩法、状态模型、是否有隐藏信息等都**相互独立**。

下面是**每个游戏都要遵循的标准**。需要具体写法时，可以参考任一已有游戏（如 `black-and-white/`）
当作示例——但**只借用基础架构层面的写法，不要假设别的游戏的玩法特性也适用于你的游戏**。

> **重要原则：不要为了"和某个已有游戏保持一致"而引入你的游戏并不需要的功能。**
> 每个游戏只实现自己玩法所需的东西。例如隐藏信息/防作弊裁剪只对**有机密状态**的游戏才需要；
> 没有隐藏信息的游戏不要照搬这套逻辑。

## 目录结构
```
proxy/            共享反向代理（每台 droplet 一个；占用 80/443，自动 TLS）
black-and-white/  一个已有游戏（可作架构示例）
<new-game>/       每个游戏一个文件夹，自包含
```

## 每个游戏的架构标准
每个游戏文件夹内是一个 npm workspaces monorepo，三个包：
- `packages/shared` — 纯 TS：类型 + 规则引擎，**无 IO**。前后端共用同一份逻辑。
- `packages/server` — Node + Socket.IO，**权威方**。真实状态只存服务器内存（`Map<roomCode, Session>`）。
- `packages/client` — Svelte + Vite + TS。

**通用核心原则（每个游戏都适用）：**
- **服务器权威**：所有结算、计时、判定都在服务器；客户端只发送意图，不能伪造结果或越权操作。
- `shared/*` 是纯函数（`state + action -> new state`，无 IO、无真实时钟），前后端复用，不重复实现规则。
- 状态纯内存、无数据库；房间码配对；`sessionToken` 存 localStorage 用于 `rejoin`。
- 空房间有 TTL 清扫，避免内存泄漏。

**条件性原则（按你的游戏是否需要再决定）：**
- **隐藏信息**：**如果**你的游戏有机密状态（某玩家不该看到的信息），机密**永不**离开服务器，
  客户端只收裁剪后的视图，并补一条"未泄露"回归测试（见测试标准）。
  **如果**没有隐藏信息（全状态本就对双方公开），就**不要**加裁剪或防泄露逻辑——
  此时服务器权威只为**公平**（判定/计时/计分），不为保密。
- 其它玩法相关的机制（回合制 vs 实时计时、抢答、记牌等）由各游戏自行决定，不在通用标准内。

## 技术栈（无充分理由不要偏离）
Svelte 4 + Vite 5 ｜ **Tailwind CSS v4**（`@tailwindcss/vite`）｜ Socket.IO 4 ｜
Node 22 + TS 5（生产用 `tsx` 直跑 TS，不编译）｜ Vitest

## 样式标准（Tailwind v4）
- 用 `@tailwindcss/vite` 插件（加进 `vite.config.ts` 的 plugins）。
- 设计 token 集中在 `src/theme.css` 的 `@theme` 块（`--color-*` / `--font-*` 会自动生成
  `bg-* / text-* / border-*` 工具类）；页面级背景放 `@layer base`，reset 交给 preflight。
- 组件里**直接用工具类**；精确像素/阴影用 arbitrary value（如 `rounded-[20px]`、
  `shadow-[0_8px_32px_rgba(0,0,0,0.5)]`），颜色一律走 token 工具类。
- 重复的 UI（按钮、chip 等）抽成共享组件，不要在多个组件里复制同一套 class。
- 尽量不写 scoped `<style>`；只有工具类实在表达不了时才用。

## 测试标准
- `shared/`：规则引擎做充分单元测试（TDD 核心区）。
- `server/`：用两个 socket.io-client 跑完整一局的集成测试，并包含**服务器权威性回归**——
  断言伪造/越权/非法动作被拒、结算只由服务器做。
  **若你的游戏有隐藏信息**，再加一条**防泄露回归**——断言机密状态从不出现在任何下发消息里。
  （没有隐藏信息的游戏不需要这条。）
- `client/`：轻量即可。
- 完成前必须 `npm test`（全包）+ `npm run check --workspace @<game>/client` 全绿。

## 部署契约（每个游戏都要遵守）
一个共享 proxy；每个游戏自带 compose + Caddyfile，并加入 external 的 `web` docker 网络。
**为新游戏加部署，只需：**
1. 复制一份现有游戏的 `Dockerfile`、`docker-compose.yml`、`.dockerignore`、`web/Caddyfile` 当骨架。
2. 把里面的服务名/镜像名前缀改成你的游戏名（如 `xx-web` / `xx-server`）。
3. `*-server` 仅内网（`expose: 3001`，不 publish）；`*-web` 是 Caddy，服务静态客户端并把
   `/socket.io/` 反代到 server。
4. 在 `proxy/Caddyfile` 加**一个块**：`yourgame.minyu.me { reverse_proxy xx-web:80 }`。
5. 客户端用 `io()` 同源连接；`CORS_ORIGIN` 环境变量可覆盖（生产默认同源）。

每个游戏自带一份 `DEPLOY.md` 记录自己的步骤。

## 新游戏 checklist
- [ ] 搭出 `packages/{shared,server,client}` 与各自 package.json/tsconfig
- [ ] 先写 `shared` 的类型 + 纯函数规则引擎，配单元测试
- [ ] `server`：rooms + session + socket 事件入口；权威结算；带服务器权威性回归测试
      （含隐藏信息的游戏再加一条防泄露回归）
- [ ] `client`：Svelte 组件 + socket store（连接 + 事件订阅 + localStorage `rejoin`）
- [ ] 复制并重命名 4 个部署文件；在 `proxy/Caddyfile` 加一行
- [ ] `npm test` + `svelte-check` 全绿

## 约定
- **不要替用户 commit**（用户自己 commit）。
- **只实现你的游戏需要的功能**，不要因为别的游戏有就照搬。
- 有隐藏/机密状态时，把它留在服务器端，并补一条证明"未泄露"的回归测试；没有就不必。
- 注释解释 **为什么**，不是 **是什么**。
