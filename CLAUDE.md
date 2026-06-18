# TwoPlayerGames — repo 范式与要求（给 agent 看）

本 repo 托管多个**双人在线小游戏**。每个游戏自成一体，但**共用同一套架构与部署方式**。
`black-and-white/` 是**参照实现（reference）**：照着它做即可，只有需要具体细节时再去读它的源码。

## 目录结构
```
proxy/            共享反向代理（每台 droplet 一个；占用 80/443，自动 TLS）
black-and-white/  参照游戏
<new-game>/       每个游戏一个文件夹，自包含
```

## 每个游戏的架构标准
每个游戏文件夹内是一个 npm workspaces monorepo，三个包：
- `packages/shared` — 纯 TS：类型 + 规则引擎，**无 IO**。前后端共用同一份逻辑。
- `packages/server` — Node + Socket.IO，**权威方**。真实状态只存服务器内存（`Map<roomCode, Session>`）。
- `packages/client` — Svelte + Vite + TS。

核心原则：
- **服务器权威 + 隐藏信息**：机密状态**永不**离开服务器，客户端只收裁剪后的视图。
- `shared/*` 是纯函数（`state + action -> new state`），前后端复用，不重复实现规则。
- 状态纯内存、无数据库；房间码配对；`sessionToken` 存 localStorage 用于 `rejoin`。
- 空房间有 TTL 清扫，避免内存泄漏（见 BW `gameSession.ts` / `rooms.ts`）。

## 技术栈（无充分理由不要偏离）
Svelte 4 + Vite 5 ｜ **Tailwind CSS v4**（`@tailwindcss/vite`）｜ Socket.IO 4 ｜
Node 22 + TS 5（生产用 `tsx` 直跑 TS，不编译）｜ Vitest

## 样式标准（Tailwind v4）
- 用 `@tailwindcss/vite` 插件（加进 `vite.config.ts` 的 plugins）。
- 设计 token 集中在 `src/theme.css` 的 `@theme` 块（`--color-*` / `--font-*` 会自动生成
  `bg-* / text-* / border-*` 工具类）；页面级背景放 `@layer base`，reset 交给 preflight。
- 组件里**直接用工具类**；精确像素/阴影用 arbitrary value（如 `rounded-[20px]`、
  `shadow-[0_8px_32px_rgba(0,0,0,0.5)]`），颜色一律走 token 工具类。
- 重复的 UI（按钮、chip 等）抽成共享组件（见 BW 的 `lib/Button.svelte`、`lib/Chip.svelte`），
  不要在多个组件里复制同一套 class。
- 尽量不写 scoped `<style>`；只有工具类实在表达不了时才用。

## 测试标准
- `shared/`：规则引擎做充分单元测试（TDD 核心区）。
- `server/`：用两个 socket.io-client 跑完整一局的集成测试；**必须**包含防作弊回归——
  断言机密状态从不出现在任何下发消息里。
- `client/`：轻量即可。
- 完成前必须 `npm test`（全包）+ `npm run check --workspace @<game>/client` 全绿。

## 部署契约（每个游戏都要遵守）
一个共享 proxy；每个游戏自带 compose + Caddyfile，并加入 external 的 `web` docker 网络。
**为新游戏加部署，只需：**
1. 复制 BW 的 `Dockerfile`、`docker-compose.yml`、`.dockerignore`、`web/Caddyfile`。
2. 把里面的 `bw-` 前缀改成你的游戏名（如 `xx-web` / `xx-server`，连同 image 名）。
3. `*-server` 仅内网（`expose: 3001`，不 publish）；`*-web` 是 Caddy，服务静态客户端并把
   `/socket.io/` 反代到 server。
4. 在 `proxy/Caddyfile` 加**一个块**：`yourgame.minyu.me { reverse_proxy xx-web:80 }`。
5. 客户端用 `io()` 同源连接；`CORS_ORIGIN` 环境变量可覆盖（生产默认同源）。

完整步骤见 `black-and-white/DEPLOY.md`。

## 新游戏 checklist
- [ ] 仿照 BW 搭出 `packages/{shared,server,client}` 与各自 package.json/tsconfig
- [ ] 先写 `shared` 的类型 + 纯函数规则引擎，配单元测试
- [ ] `server`：rooms + session + socket 事件入口；权威结算；带防作弊回归测试
- [ ] `client`：Svelte 组件 + socket store（参照 BW 的 `socket.ts` 模式）
- [ ] 复制并重命名 4 个部署文件；在 `proxy/Caddyfile` 加一行
- [ ] `npm test` + `svelte-check` 全绿

## 约定
- **不要替用户 commit**（用户自己 commit）。
- 任何隐藏/机密状态留在服务器端，并补一条证明"未泄露"的回归测试。
- 注释解释 **为什么**，不是 **是什么**。
