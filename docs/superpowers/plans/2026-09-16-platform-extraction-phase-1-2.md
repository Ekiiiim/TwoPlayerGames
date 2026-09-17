# 跨游戏基础设施抽取 — 阶段 1 & 2 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 repo 根变成唯一 npm workspace root、四个游戏的技术栈对齐到同一套版本，
并抽出第一个共享包 `@tpg/protocol`（线协议类型），为后续抽取会话逻辑和 UI 铺好地基。

**Architecture:** 先逐个游戏升级技术栈——此时四个游戏仍是各自独立的 workspace root，
所以某个游戏升级失败只影响它自己。四个对齐后再把 workspace root 上移到 repo 根，
npm 此时没有版本要协调。地基好了才抽 `@tpg/protocol`：它只含四个游戏逐字相同的类型，
各游戏的 `packages/shared` 原样 re-export，所以游戏代码里的 import 语句一句不改。

**Tech Stack:** npm workspaces ｜ Svelte 5 ｜ Vite 8 ｜ Vitest 4 ｜ TypeScript 5 ｜
Tailwind CSS v4 ｜ Socket.IO 4 ｜ Node 22 + tsx

**Spec:** `docs/superpowers/specs/2026-09-16-platform-extraction-design.md`
（本计划覆盖其中的阶段 1 与阶段 2；阶段 3–7 另行出计划）

## Global Constraints

每个 task 的要求都隐含包含这一节。

- **目标版本（精确值，取自 texas-poker 现装版本）**：`svelte` `^5.56.8`、
  `vite` `^8.2.0`、`vitest` `^4.1.10`、`svelte-check` `^4.7.4`、
  `@sveltejs/vite-plugin-svelte` `^7.2.0`、`svelte-preprocess` `^6.0.5`。
- **不动的版本**：`typescript` `^5.4.0`、`tailwindcss` `^4.3.1`、
  `@tailwindcss/vite` `^4.3.1`、`socket.io` `^4.7.0`、`socket.io-client` `^4.7.0`、
  `tsx` `^4.7.0`。
- **Node 下限 `>=22.12`**（Vite 8 的 engines 是 `^20.19.0 || >=22.12.0`）。
  本机 v22.14.0，Docker 基镜像 `node:22-alpine`，都满足。
- **npm 下限 `>=11`（本机）。** npm 10.9.2 在这个依赖图上必崩，报
  `Cannot read properties of null (reading 'edgesOut')`，位置是 arborist 的
  `#loadPeerSet`。触发条件是规模：单个游戏三个包能装，12 个包必崩，和版本是否
  对齐无关。已于 2026-09-16 全局升到 npm 11.19.1。
  **Docker 不受影响**——`npm ci` 只做 lockfile reification，不走崩溃那条
  ideal-tree 代码路径；实测 npm 10.9.2 对 npm 11 生成的 lockfile 跑 `npm ci`
  正常，lockfileVersion 仍是 3。所以 `node:22-alpine` 自带的 npm 10 不用动。
- **实际解析到的版本**（npm 11 装出来，都在上面的 caret 范围内）：
  svelte 5.57.0、vite 8.3.0、vitest 4.1.11、svelte-check 4.7.6、
  `@sveltejs/vite-plugin-svelte` 7.3.0、svelte-preprocess 6.0.5。
  texas-poker 原本锁在 svelte 5.56.8 / vite 8.2.0，Task 5 之后会跟着升到这一组。
- **每个 client 都要一份 `svelte.config.js`，内容四份相同。** svelte 5.57 起
  编译器默认走 runes 模式，而 runes 模式禁止 `$` 前缀变量名，于是所有
  `$t` / `$lang` / `$ended` 这类 store 自动订阅全部报
  `illegal variable name`。写死 `compilerOptions: { runes: false }`，不要依赖
  默认值。（这四份相同的配置在阶段 5 由 `platform/build` 收走。）
- **每个 client 的 tsconfig 都要 `"verbatimModuleSyntax": true`。**
  svelte-check 4.7.6 对带 `lang="ts"` 的 `.svelte` 文件强制要求这一项，
  否则每次运行都打印一条提示。
- **svelte-check 抓不到 `new App(...)`。** 实测 black-and-white 迁移前
  svelte-check 是 0 errors，但运行时 Svelte 5 会抛
  `component_api_invalid_new`。所以浏览器验证不是锦上添花，是唯一的判据。
- **Baseline**：151 个测试全过（black-and-white 45、flip-math 52、
  add-to-fifty 23、texas-poker 31），四个 `svelte-check` 各 0 errors 0 warnings。
  任何 task 结束时必须仍是这个数字或更多。
- **不改玩法逻辑。** 阶段 1 里唯一允许的业务代码改动是两处 Svelte 5 API 迁移：
  `new App({ target })` → `mount(App, { target })`，以及 `Hand.svelte` 的
  `createEventDispatcher` → 回调 prop。
- **组件测试为零。** 四个游戏的测试一个都不 mount 组件，所以「测试绿」不能证明页面
  还能渲染。Svelte 5 升级的每个 task 必须用浏览器验证大厅真的渲染出来。
- **`PLAYER_IDS` 的类型注解保持 `readonly PlayerId[]`**，不要改成 `as const` 元组，
  避免下游类型收窄引发连锁改动。
- **不 `git push`。** 只 commit。

## File Structure

阶段 1（每个游戏三个 package.json + 客户端入口）：

| 文件 | 责任 |
| --- | --- |
| `<game>/packages/{client,server,shared}/package.json` | 依赖版本，每游戏 3 份 |
| `black-and-white/packages/client/src/main.ts` | 入口，`mount()` 迁移 |
| `flip-math/packages/client/src/main.ts` | 同上 |
| `add-to-fifty/packages/client/src/main.ts` | 同上 |
| `black-and-white/packages/client/src/lib/Hand.svelte` | 出牌手牌区，事件改回调 prop |
| `black-and-white/packages/client/src/lib/Table.svelte` | Hand 的消费方，接住回调 |
| `package.json`（repo 根） | 从「只管 prettier」变成唯一 workspace root |
| `<game>/package.json` × 4 | 删除（`workspaces` 与 `test` 脚本由根接管） |
| `<game>/package-lock.json` × 4 | 删除，根生成一份 |
| `<game>/.gitignore` × 4 | 删掉 `node_modules/`（已不存在），保留 dist 规则 |
| `.claude/launch.json` | 四个 dev server 的 `--prefix` 参数失效，改掉 |

阶段 2（新包 + 四个游戏的接线）：

| 文件 | 责任 |
| --- | --- |
| `platform/protocol/package.json` | 包声明，源码分发（`main: "src/index.ts"`） |
| `platform/protocol/tsconfig.json` | 编译配置 |
| `platform/protocol/src/index.ts` | `PlayerId`、`PLAYER_IDS`、`ErrorCode`、`ErrorMsg`、大厅事件契约 |
| `platform/protocol/test/protocol.test.ts` | 断言导出的形状 |
| `<game>/packages/shared/src/types.ts` × 4 | 删本地定义，改 re-export |
| `<game>/packages/shared/src/game.ts` × 4 | 删本地 `PLAYER_IDS`，改 re-export |
| `<game>/packages/shared/package.json` × 4 | 加 `@tpg/protocol` 依赖 |

部署修回可构建（Task 7，插在 protocol 包建好之后）：

| 文件 | 责任 |
| --- | --- |
| `.dockerignore`（repo 根，新建） | 构建上下文抬到根后，Docker 只读这一份 |
| `<game>/.dockerignore` × 4 | 删除（不在构建上下文根目录，已失效） |
| `<game>/Dockerfile` × 4 | COPY 路径加游戏名前缀，加 `platform` |
| `<game>/docker-compose.yml` × 4 | `context: ..` + `dockerfile: <game>/Dockerfile` |
| `<game>/DEPLOY.md` × 4 | 补一句构建上下文的说明 |

---

# 阶段 1

## Task 1: black-and-white 升级到 Svelte 5 / Vite 8 / Vitest 4

**Files:**
- Modify: `black-and-white/packages/client/package.json`
- Modify: `black-and-white/packages/server/package.json`
- Modify: `black-and-white/packages/shared/package.json`
- Modify: `black-and-white/packages/client/src/main.ts`
- Modify: `black-and-white/packages/client/src/lib/Hand.svelte`
- Modify: `black-and-white/packages/client/src/lib/Table.svelte:91-93,260-265`

**Interfaces:**
- Consumes: 无（第一个 task）
- Produces: `Hand.svelte` 的 prop 从 `on:select` 事件变成
  `onSelect: (card: number) => void`。后续任何改 `Hand` 的 task 用这个签名。

- [x] **Step 1: 记下 baseline 数字**

Run: `npm --prefix black-and-white test 2>&1 | grep -E "Tests "`

Expected：三行，分别是 6 passed、19 passed、20 passed（合计 45）。
记下来，Step 6 要对比。

- [x] **Step 2: 升级 client 的 package.json**

把 `black-and-white/packages/client/package.json` 的 `devDependencies` 整块替换为：

```json
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^7.2.0",
    "@tailwindcss/vite": "^4.3.1",
    "svelte": "^5.56.8",
    "svelte-check": "^4.7.4",
    "svelte-preprocess": "^6.0.5",
    "tailwindcss": "^4.3.1",
    "typescript": "^5.4.0",
    "vite": "^8.2.0",
    "vitest": "^4.1.10"
  }
```

`dependencies`（`@bw/shared`、`socket.io-client`）不动。

- [x] **Step 3: 升级 server 与 shared 的 package.json**

两个文件里的 `"vitest": "^1.6.0"` 都改成 `"vitest": "^4.1.10"`。其余不动。

- [x] **Step 4: 安装**

Run: `npm --prefix black-and-white install`
Expected：安装成功。装完确认版本：

```bash
node -p "require('/Users/chengminyu/Desktop/TwoPlayerGames/black-and-white/node_modules/svelte/package.json').version"
```

Expected：`5.56.8`（或更高的 5.x）。

- [x] **Step 5: 跑 svelte-check，看它报出什么**

Run: `npm --prefix black-and-white run check --workspace @bw/client`

**实际结果（2026-09-16）**：FAIL，但不是 `new App(...)`——是 6 处
`$t` / `$lang` / `$ended` 报 `illegal variable name`，因为 svelte 5.57 默认走
runes 模式。修法见 Global Constraints 里的 `svelte.config.js`。修完这 6 条之后
还剩一条新增的 a11y 警告（`Table.svelte` 的 `role="dialog"` 元素缺 `tabindex`），
补 `tabindex="-1"`。

`new App(...)` 全程没有被 svelte-check 报出来——它只在浏览器运行时炸。

- [x] **Step 6: 跑测试，确认 Vitest 4 没有破坏现有测试**

Run: `npm --prefix black-and-white test 2>&1 | grep -E "Tests |FAIL"`
Expected：仍是 6 + 19 + 20 = 45 passed。

这些测试只用 `describe`/`it`/`expect`/`afterEach`，没有 `vi.*`、没有 fake timers、
没有 `vitest.config.*`，所以 Vitest 1 → 4 对它们是零影响。真跑一遍确认这个判断。

- [x] **Step 7: 迁移入口到 mount()**

`black-and-white/packages/client/src/main.ts` 整个替换为：

```ts
import "./theme.css";
import { mount } from "svelte";
import App from "./App.svelte";

const app = mount(App, { target: document.getElementById("app")! });

export default app;
```

- [x] **Step 8: 把 Hand 的组件事件改成回调 prop**

`black-and-white/packages/client/src/lib/Hand.svelte` 的 `<script>` 开头四行
（`import { createEventDispatcher }`、`const dispatch = ...`、`handleClick` 的
`dispatch` 调用）改成：

```svelte
<script lang="ts">
  import { colorOf } from "@bw/shared";

  export let cards: number[];
  export let myTurn: boolean;
  export let selected: number | null = null;
  // Svelte 5 弃用了组件事件派发,回调 prop 是等价且受类型检查的写法。
  export let onSelect: (card: number) => void;

  function handleClick(c: number): void {
    if (!myTurn) return;
    onSelect(c);
  }
```

`base`、`cls()` 和下面的 markup 一行不动。

- [x] **Step 9: 让 Table 接住回调**

`black-and-white/packages/client/src/lib/Table.svelte:91-93`，把

```svelte
  function onSelect(e: CustomEvent<number>): void {
    if (!myTurn) return;
    selectedCard = e.detail === selectedCard ? null : e.detail;
  }
```

改成

```svelte
  function onSelect(card: number): void {
    if (!myTurn) return;
    selectedCard = card === selectedCard ? null : card;
  }
```

同文件 `260-265` 行，把

```svelte
      <Hand
        cards={view.myHand}
        {myTurn}
        selected={selectedCard}
        on:select={onSelect}
      />
```

改成

```svelte
      <Hand cards={view.myHand} {myTurn} selected={selectedCard} {onSelect} />
```

- [x] **Step 10: svelte-check 必须回到全绿**

Run: `npm --prefix black-and-white run check --workspace @bw/client`
Expected：`svelte-check found 0 errors and 0 warnings`

如果还有 error，逐条修；不要放过 warning——baseline 是 0 warnings，
放过一条就失去了「有没有引入新问题」的判据。

- [x] **Step 11: 浏览器验证大厅真的渲染**

测试不 mount 任何组件，所以这一步是 Svelte 5 升级唯一的真实证据。

用 preview_start 起 `bw-client`（`.claude/launch.json` 里已有这个配置，
端口 5173）。然后：

1. `read_page` 确认页面上有大厅：标题「黑与白」/「Black & White」、
   「创建房间」按钮、6 位房间码输入框。
2. `read_console_messages` 带 `onlyErrors: true`，确认没有 Svelte 相关报错
   （`component_api_invalid_new`、`lifecycle_`、`effect_` 之类）。

游戏服务器没起，所以 socket.io 的连接失败错误会出现在 console 里——那条无关，
忽略。要确认的是**没有 Svelte 自己的报错**，并且大厅 DOM 在。

3. 点「创建房间」不需要做——没有服务器它不会有反应，而大厅渲染出来已经证明
   `mount()` 和整条组件树编译通过。

- [x] **Step 12: Commit**

```bash
git add black-and-white/packages/client/package.json \
        black-and-white/packages/server/package.json \
        black-and-white/packages/shared/package.json \
        black-and-white/package-lock.json \
        black-and-white/packages/client/src/main.ts \
        black-and-white/packages/client/src/lib/Hand.svelte \
        black-and-white/packages/client/src/lib/Table.svelte
git commit -m "chore(black-and-white): upgrade to Svelte 5 / Vite 8 / Vitest 4"
```

---

## Task 2: flip-math 升级到 Svelte 5 / Vite 8 / Vitest 4

**Files:**
- Modify: `flip-math/packages/client/package.json`
- Modify: `flip-math/packages/server/package.json`
- Modify: `flip-math/packages/shared/package.json`
- Modify: `flip-math/packages/client/src/main.ts`

**Interfaces:**
- Consumes: 无（与 Task 1 无依赖，只是共用同一套目标版本）
- Produces: 无新接口

flip-math 没有 `createEventDispatcher`，所以只有入口一处要改。

- [x] **Step 1: 记下 baseline**

Run: `npm --prefix flip-math test 2>&1 | grep -E "Tests "`
Expected：6 passed、9 passed、37 passed（合计 52）。

- [x] **Step 2: 升级 client 的 package.json**

`flip-math/packages/client/package.json` 的 `devDependencies` 整块替换为：

```json
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^7.2.0",
    "@tailwindcss/vite": "^4.3.1",
    "svelte": "^5.56.8",
    "svelte-check": "^4.7.4",
    "svelte-preprocess": "^6.0.5",
    "tailwindcss": "^4.3.1",
    "typescript": "^5.4.0",
    "vite": "^8.2.0",
    "vitest": "^4.1.10"
  }
```

- [x] **Step 3: 升级 server 与 shared 的 package.json**

两个文件里的 `"vitest": "^1.6.0"` 改成 `"vitest": "^4.1.10"`。

- [x] **Step 3b: 建 svelte.config.js**

Create `flip-math/packages/client/svelte.config.js`（和 black-and-white 那份
逐字相同）：

```js
import preprocess from "svelte-preprocess";

export default {
  preprocess: preprocess(),
  // 这些组件是 Svelte 4 时代的写法:export let + $store 自动订阅。
  // Svelte 5.57 起编译器默认走 runes 模式,而 runes 模式禁止 $ 前缀变量名,
  // 于是 $t / $lang 全部报 illegal variable name。写死 runes: false 而不是
  // 依赖默认值,免得下一个小版本再翻一次。
  compilerOptions: { runes: false },
};
```

- [x] **Step 3c: tsconfig 加 verbatimModuleSyntax**

`flip-math/packages/client/tsconfig.json` 的 `compilerOptions` 加一项
`"verbatimModuleSyntax": true`。svelte-check 4.7.6 对带 `lang="ts"` 的
`.svelte` 文件强制要求它。

- [x] **Step 4: 安装**

Run: `cd flip-math && npm install && cd ..`

需要 npm >= 11，见 Global Constraints。

- [x] **Step 5: svelte-check，收集要修的问题**

Run: `npm --prefix flip-math run check --workspace @fm/client 2>&1 | grep -E "ERROR|WARNING|COMPLETED"`

预期会看到新版本带来的 a11y 警告（black-and-white 那边是一条
`a11y_interactive_supports_focus`——`role="dialog"` 的元素要有 `tabindex`）。
baseline 是 0 errors 0 warnings，所以警告也要修掉，否则就失去了「有没有引入新
问题」的判据。

注意：**`new App(...)` 不会出现在这里**，svelte-check 抓不到它。它只在浏览器
运行时炸。

- [x] **Step 6: 跑测试**

Run: `npm --prefix flip-math test 2>&1 | grep -E "Tests |FAIL"`
Expected：仍是 52 passed。

flip-math 的服务器有真实计时器（`Durations`），它的集成测试等真实时钟而不是
fake timers，所以 Vitest 4 的 fake timer 默认值变化不影响它。这一步确认这点。

- [x] **Step 7: 迁移入口到 mount()**

`flip-math/packages/client/src/main.ts` 整个替换为：

```ts
import "./theme.css";
import { mount } from "svelte";
import App from "./App.svelte";

const app = mount(App, { target: document.getElementById("app")! });

export default app;
```

- [x] **Step 8: svelte-check 回到全绿**

Run: `npm --prefix flip-math run check --workspace @fm/client`
Expected：`0 errors and 0 warnings`

- [x] **Step 9: 浏览器验证**

preview_start 起 `flip-client`（launch.json 里已配好，端口 5174）。
`read_page` 确认大厅在：标题「翻牌数式」/「Flip Math」、「创建房间」按钮、
房间码输入框。`read_console_messages` 带 `onlyErrors: true`，
确认没有 Svelte 报错（socket.io 连接失败无关，忽略）。

- [x] **Step 10: Commit**

```bash
git add flip-math/packages/client/package.json \
        flip-math/packages/server/package.json \
        flip-math/packages/shared/package.json \
        flip-math/package-lock.json \
        flip-math/packages/client/src/main.ts
git commit -m "chore(flip-math): upgrade to Svelte 5 / Vite 8 / Vitest 4"
```

---

## Task 3: add-to-fifty 升级到 Svelte 5 / Vite 8 / Vitest 4

**Files:**
- Modify: `add-to-fifty/packages/client/package.json`
- Modify: `add-to-fifty/packages/server/package.json`
- Modify: `add-to-fifty/packages/shared/package.json`
- Modify: `add-to-fifty/packages/client/src/main.ts`

**Interfaces:**
- Consumes: 无
- Produces: 无新接口

- [x] **Step 1: 记下 baseline**

Run: `npm --prefix add-to-fifty test 2>&1 | grep -E "Tests "`
Expected：6 passed、6 passed、11 passed（合计 23）。

- [x] **Step 2: 升级 client 的 package.json**

`add-to-fifty/packages/client/package.json` 的 `devDependencies` 整块替换为：

```json
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^7.2.0",
    "@tailwindcss/vite": "^4.3.1",
    "svelte": "^5.56.8",
    "svelte-check": "^4.7.4",
    "svelte-preprocess": "^6.0.5",
    "tailwindcss": "^4.3.1",
    "typescript": "^5.4.0",
    "vite": "^8.2.0",
    "vitest": "^4.1.10"
  }
```

- [x] **Step 3: 升级 server 与 shared 的 package.json**

两个文件里的 `"vitest": "^1.6.0"` 改成 `"vitest": "^4.1.10"`。

- [x] **Step 3b: 建 svelte.config.js**

Create `add-to-fifty/packages/client/svelte.config.js`（和前两个游戏逐字相同）：

```js
import preprocess from "svelte-preprocess";

export default {
  preprocess: preprocess(),
  // 这些组件是 Svelte 4 时代的写法:export let + $store 自动订阅。
  // Svelte 5.57 起编译器默认走 runes 模式,而 runes 模式禁止 $ 前缀变量名,
  // 于是 $t / $lang 全部报 illegal variable name。写死 runes: false 而不是
  // 依赖默认值,免得下一个小版本再翻一次。
  compilerOptions: { runes: false },
};
```

- [x] **Step 3c: tsconfig 加 verbatimModuleSyntax**

`add-to-fifty/packages/client/tsconfig.json` 的 `compilerOptions` 加一项
`"verbatimModuleSyntax": true`。

- [x] **Step 4: 安装**

Run: `cd add-to-fifty && npm install && cd ..`

- [x] **Step 5: svelte-check，收集要修的问题**

Run: `npm --prefix add-to-fifty run check --workspace @add-to-fifty/client 2>&1 | grep -E "ERROR|WARNING|COMPLETED"`

预期会有新版本带来的 a11y 警告要修（baseline 是 0 errors 0 warnings）。
`new App(...)` 不会出现在这里。

- [x] **Step 6: 跑测试**

Run: `npm --prefix add-to-fifty test 2>&1 | grep -E "Tests |FAIL"`
Expected：仍是 23 passed。

- [x] **Step 7: 迁移入口到 mount()**

`add-to-fifty/packages/client/src/main.ts` 整个替换为：

```ts
import "./theme.css";
import { mount } from "svelte";
import App from "./App.svelte";

const app = mount(App, { target: document.getElementById("app")! });

export default app;
```

- [x] **Step 8: svelte-check 回到全绿**

Run: `npm --prefix add-to-fifty run check --workspace @add-to-fifty/client`
Expected：`0 errors and 0 warnings`

- [x] **Step 9: 浏览器验证**

preview_start 起 `a2f-client`（launch.json 里已配好，端口 5175）。
`read_page` 确认大厅在：标题「凑五十」/「Add to Fifty」、「创建房间」按钮、
房间码输入框。`read_console_messages` 带 `onlyErrors: true`，
确认没有 Svelte 报错。

- [x] **Step 10: Commit**

```bash
git add add-to-fifty/packages/client/package.json \
        add-to-fifty/packages/server/package.json \
        add-to-fifty/packages/shared/package.json \
        add-to-fifty/package-lock.json \
        add-to-fifty/packages/client/src/main.ts
git commit -m "chore(add-to-fifty): upgrade to Svelte 5 / Vite 8 / Vitest 4"
```

---

## Task 4: 清掉 texas-poker 装错位置的依赖

**Files:**
- Modify: `texas-poker/packages/client/package.json`
- Modify: `texas-poker/packages/server/package.json`
- Modify: `texas-poker/packages/shared/package.json`

**Interfaces:**
- Consumes: 无
- Produces: 无新接口

texas-poker 版本已经是目标版本，不用升级。但它三个 package.json 里有装错位置的
依赖：`vitest` 在 client 的 `dependencies`（测试框架不是运行时依赖），
server 和 shared 有 `svelte` 和 `vite`（后端和纯 TS 包都用不到）。root 上移后
这些错位会进同一棵依赖树，先清掉。

- [x] **Step 1: 记下 baseline**

Run: `npm --prefix texas-poker test 2>&1 | grep -E "Tests "`
Expected：6 passed、8 passed、17 passed（合计 31）。

- [x] **Step 2: 修 client 的 package.json**

把 `"vitest": "4.1.10"` 从 `dependencies` 删掉，在 `devDependencies` 里加
`"vitest": "^4.1.10"`。改完 `dependencies` 只剩两条：

```json
  "dependencies": {
    "@texas-poker/shared": "*",
    "socket.io-client": "^4.7.0"
  },
```

`devDependencies` 与另外三个游戏对齐（注意 `@tailwindcss/vite` 和 `tailwindcss`
现在写的是 `^4.3.1`，保持不动）：

```json
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^7.2.0",
    "@tailwindcss/vite": "^4.3.1",
    "svelte": "^5.56.8",
    "svelte-check": "^4.7.4",
    "svelte-preprocess": "^6.0.5",
    "tailwindcss": "^4.3.1",
    "typescript": "^5.4.0",
    "vite": "^8.2.0",
    "vitest": "^4.1.10"
  }
```

- [x] **Step 3: 修 server 的 package.json**

删掉 `dependencies` 里的 `"svelte": "5.56.8"` 和 `"vite": "8.2.0"`。
改完 `dependencies` 只剩三条：

```json
  "dependencies": {
    "@texas-poker/shared": "*",
    "socket.io": "^4.7.0",
    "tsx": "^4.7.0"
  },
```

- [x] **Step 4: 修 shared 的 package.json**

整块删掉 `dependencies`（里面只有 `svelte` 和 `vite`）。`@texas-poker/shared`
是纯 TS 规则引擎，没有运行时依赖。

- [x] **Step 4b: 建 svelte.config.js**

texas-poker 现在锁在 svelte 5.56.8，还没有 runes 默认值的问题。但 Task 5 的根
安装会把它解析到 5.57.0，那时它和另外三个一样会全线报
`illegal variable name`。所以现在就补上，别等 Task 5 再回头查。

Create `texas-poker/packages/client/svelte.config.js`（和另外三个逐字相同）：

```js
import preprocess from "svelte-preprocess";

export default {
  preprocess: preprocess(),
  // 这些组件是 Svelte 4 时代的写法:export let + $store 自动订阅。
  // Svelte 5.57 起编译器默认走 runes 模式,而 runes 模式禁止 $ 前缀变量名,
  // 于是 $t / $lang 全部报 illegal variable name。写死 runes: false 而不是
  // 依赖默认值,免得下一个小版本再翻一次。
  compilerOptions: { runes: false },
};
```

- [x] **Step 4c: tsconfig 加 verbatimModuleSyntax**

`texas-poker/packages/client/tsconfig.json` 的 `compilerOptions` 加一项
`"verbatimModuleSyntax": true`。

- [x] **Step 5: 重装并跑测试**

Run: `cd texas-poker && npm install && cd .. && npm --prefix texas-poker test 2>&1 | grep -E "Tests |FAIL"`
Expected：仍是 31 passed。

- [x] **Step 6: svelte-check 与构建都要绿**

Run: `npm --prefix texas-poker run check --workspace @texas-poker/client`
Expected：`0 ERRORS 0 WARNINGS`

Run: `npm --prefix texas-poker run build --workspace @texas-poker/client`
Expected：构建成功。

删 server/shared 的 `svelte` 和 `vite` 之后要跑一次构建，因为如果客户端构建
其实是在靠那两条错位依赖解析某个包，这里会暴露出来。

- [x] **Step 7: 浏览器验证**

preview_start 起 `texas-client`（launch.json 里已配好，端口 5176）。
`read_page` 确认大厅在：标题「Texas Poker」、「创建房间」按钮、房间码输入框。
`read_console_messages` 带 `onlyErrors: true`。

- [x] **Step 8: Commit**

```bash
git add texas-poker/packages/client/package.json \
        texas-poker/packages/server/package.json \
        texas-poker/packages/shared/package.json \
        texas-poker/package-lock.json
git commit -m "chore(texas-poker): move vitest to devDeps, drop unused svelte/vite deps"
```

---

## Task 5: workspace root 上移到 repo 根

**Files:**
- Modify: `package.json`
- Delete: `black-and-white/package.json`、`flip-math/package.json`、
  `add-to-fifty/package.json`、`texas-poker/package.json`
- Delete: 四个 `<game>/package-lock.json`
- Delete: 四个 `<game>/node_modules/`（目录，未入 git）
- Modify: 四个 `<game>/.gitignore`
- Modify: `.claude/launch.json`
- Create: `package-lock.json`（npm install 生成）

**Interfaces:**
- Consumes: Task 1–4 的产物（四个游戏已在同一套版本上）
- Produces: 根脚本 `npm test` 与 `npm run check` 跑全部四个游戏的全部 workspace。
  后续所有 task 的验证命令都用这两个，不再用 `npm --prefix <game>`。

- [x] **Step 1: 确认四个游戏版本已对齐**

```bash
cd /Users/chengminyu/Desktop/TwoPlayerGames
for g in black-and-white flip-math add-to-fifty texas-poker; do
  echo "$g svelte: $(node -p "require('./$g/node_modules/svelte/package.json').version")"
done
```

Expected：四行都是 `5.56.8`。不是的话回到 Task 1–3 补完，别往下走——root 上移的
前提就是 npm 没有版本要协调。

- [x] **Step 2: 改根 package.json**

`package.json` 整个替换为：

```json
{
  "name": "twoplayergames",
  "version": "0.0.0",
  "private": true,
  "description": "并列的双人在线小游戏。共享基础设施在 platform/*,玩法各自独立。",
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
  },
  "devDependencies": {
    "prettier": "^3.3.3",
    "prettier-plugin-svelte": "^3.2.6",
    "svelte": "^5.56.8"
  }
}
```

`prettier-plugin-svelte` 要的 peer 是 `svelte`，所以根的 `svelte` 从 `^4.2.0`
提到 `^5.56.8`，和各 client 一致。

- [x] **Step 3: 删掉四个游戏的 package.json 和 lockfile**

```bash
cd /Users/chengminyu/Desktop/TwoPlayerGames
rm black-and-white/package.json flip-math/package.json \
   add-to-fifty/package.json texas-poker/package.json
rm black-and-white/package-lock.json flip-math/package-lock.json \
   add-to-fifty/package-lock.json texas-poker/package-lock.json
rm -rf black-and-white/node_modules flip-math/node_modules \
       add-to-fifty/node_modules texas-poker/node_modules
```

这四个 package.json 只有 `workspaces` 和一个 `test` 脚本，两者都由根接管了。

- [x] **Step 4: 装成一棵树**

Run: `npm install`
Expected：成功，根生成一份 `package-lock.json`。

确认没有嵌套（四个游戏版本已对齐，应该一个嵌套都没有）：

```bash
find . -path ./node_modules -prune -o -name node_modules -print
```

Expected：只有 `./node_modules` 一行。如果 `<game>/packages/*/node_modules`
还在，说明某个 package.json 的版本范围没对齐，回 Step 1。

- [x] **Step 5: 跑全量测试**

Run: `npm test 2>&1 | grep -E "Tests |FAIL"`
Expected：12 个 workspace 的测试，合计 151 passed
（45 + 52 + 23 + 31）。

- [x] **Step 6: 跑全量 svelte-check**

Run: `npm run check 2>&1 | grep -iE "errors|warnings|ERRORS"`
Expected：四个 client 各报 0 errors 0 warnings。

- [x] **Step 7: 把 node_modules 规则提到根，各游戏只留 dist**

根 `.gitignore` 现在写的是 `/node_modules/`，前导斜杠让它只匹配根那一个目录。
但 vite 和 vitest 会在每个 workspace 下建 `packages/*/node_modules/.vite` 缓存，
所以规则要改成不带斜杠的 `node_modules/`，匹配任意层级：

```
# Claude Code local/personal files (keep shared config like launch.json tracked)
.claude/settings.local.json
.claude/worktrees/

# 依赖与工具缓存。不带前导斜杠,所以任意层级都匹配 —— vite/vitest 会在
# 每个 workspace 下建 packages/*/node_modules/.vite 缓存。
node_modules/

# OS/editor junk
.DS_Store
.clone/
```

然后四个 `<game>/.gitignore` 只留自己的 dist 规则：
black-and-white 与 flip-math 留 `dist/`，add-to-fifty 与 texas-poker 留
`packages/*/dist/`。

（原计划写的是「各游戏删掉 `node_modules/`、由根的 `/node_modules/` 管」，
那是错的——带斜杠的规则管不到嵌套层级，照此改完那些 `.vite` 缓存会全部冒到
`git status` 里。）

- [x] **Step 8: 改 launch.json**

`.claude/launch.json` 里四个配置的 `runtimeArgs` 都带
`"--prefix", "<game>"`，root 上移后这个前缀指向的目录已经没有 package.json 了。
四个配置的 `runtimeArgs` 分别改成：

```json
["run", "dev", "--workspace", "@bw/client"]
["run", "dev", "--workspace", "@fm/client", "--", "--port", "5174", "--strictPort"]
["run", "dev", "--workspace", "@add-to-fifty/client", "--", "--port", "5175", "--strictPort"]
["run", "dev", "--workspace", "@texas-poker/client", "--", "--port", "5176", "--strictPort"]
```

`name` 和 `port` 不动。

- [x] **Step 9: 四个 dev server 都要能起**

逐个 preview_start：`bw-client`、`flip-client`、`a2f-client`、`texas-client`。
每个都 `read_page` 确认大厅渲染、`read_console_messages` 带 `onlyErrors: true`
确认没有 Svelte 报错。

这一步验的是 launch.json 改对了、并且单一 node_modules 下四个 client 的
Vite 都能解析到自己的依赖。

- [x] **Step 10: 确认 prettier 还认得这个 repo**

Run: `npm run format:check`

**注意：这个闸门在 main 上本来就是红的。** 五个文件在本分支之前就不通过
prettier：`add-to-fifty/.../PlayingCard.svelte`、
`texas-poker/.../App.svelte`、`texas-poker/packages/shared/src/{game,hand}.ts`、
`texas-poker/packages/shared/test/hand.test.ts`。判断方法是把 main 上的内容
喂给 prettier：

```bash
git show "main:<file>" | npx prettier --check --stdin-filepath "<file>"
```

跑 `npm run format` 把这五个修掉，单独一个 `style: prettier` commit，
不要混进 root 上移那个。修完之后 `format:check` 才能当闸门用——红了就说明是
真的格式疏漏，而不是既有噪音。

- [x] **Step 11: Commit**

```bash
git add -A package.json package-lock.json .claude/launch.json \
        black-and-white flip-math add-to-fifty texas-poker
git commit -m "chore: make repo root the single npm workspace root"
```

---

# 阶段 2

## Task 6: 建 platform/protocol 包

**Files:**
- Create: `platform/protocol/package.json`
- Create: `platform/protocol/tsconfig.json`
- Create: `platform/protocol/src/index.ts`
- Create: `platform/protocol/test/protocol.test.ts`

**Interfaces:**
- Consumes: Task 5 的根 workspace（`platform/*` 已在 `workspaces` 里）
- Produces: 包名 `@tpg/protocol`，导出
  `PlayerId`、`PLAYER_IDS`（类型 `readonly PlayerId[]`）、`ErrorCode`、
  `ErrorMsg`、`RoomAccepted`、`LobbyServerEvents`、`LobbyClientEvents`。
  Task 7 和后续阶段全部从这里取这些名字。

- [x] **Step 1: 写失败的测试**

Create `platform/protocol/test/protocol.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { PLAYER_IDS } from "../src/index";
import type { ErrorCode, ErrorMsg, PlayerId, RoomAccepted } from "../src/index";

describe("PLAYER_IDS", () => {
  it("正好是两个玩家,顺序固定", () => {
    expect(PLAYER_IDS).toEqual(["p1", "p2"]);
  });
});

describe("类型契约", () => {
  // 这些断言在编译期生效:类型不对 vitest 跑不起来(vitest 走 esbuild
  // 不做类型检查,所以真正的守卫是 tsc,见 Step 5)。运行时断言留在这里
  // 是为了这些字面量真的被求值过,而不是被 tree-shaking 掉。
  it("7 个 ErrorCode 都可赋值", () => {
    const codes: ErrorCode[] = [
      "ALREADY_IN_ROOM",
      "INVALID_REQUEST",
      "ROOM_NOT_FOUND",
      "ROOM_FULL",
      "INVALID_SESSION",
      "INVALID_MOVE",
      "OPPONENT_GONE",
    ];
    expect(codes).toHaveLength(7);
  });

  it("ErrorMsg 只带一个 code 字段", () => {
    const msg: ErrorMsg = { code: "ROOM_FULL" };
    expect(Object.keys(msg)).toEqual(["code"]);
  });

  it("RoomAccepted 带房间码和 session token", () => {
    const accepted: RoomAccepted = { roomCode: "ABC234", sessionToken: "deadbeef" };
    expect(Object.keys(accepted).sort()).toEqual(["roomCode", "sessionToken"]);
  });

  it("PlayerId 只有 p1 和 p2", () => {
    const ids: PlayerId[] = ["p1", "p2"];
    expect(ids).toEqual(PLAYER_IDS);
  });
});
```

- [x] **Step 2: 跑测试确认它失败**

Run: `npm test --workspace @tpg/protocol`
Expected：FAIL——`@tpg/protocol` 这个 workspace 还不存在，npm 报
`No workspaces found`。

- [x] **Step 3: 建 package.json**

Create `platform/protocol/package.json`：

```json
{
  "name": "@tpg/protocol",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^4.1.10"
  }
}
```

`main` 指向 `src/index.ts`：源码分发，不预编译。这和四个游戏现有的
`packages/shared` 一致，消费方的 Vite / tsx 直接吃 TS。

- [x] **Step 4: 建 tsconfig.json**

Create `platform/protocol/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "isolatedModules": true,
    "noEmit": true,
    "lib": ["ESNext"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

`lib` 不含 DOM：protocol 是前后端共用的纯类型包，引用到 DOM 类型就说明放错了东西。

- [x] **Step 5: 写实现**

Create `platform/protocol/src/index.ts`：

```ts
// 四个游戏的会话层线协议。玩法事件(play_card、buzz、poker_action 等)
// 和玩法状态(ClientView)不在这里,它们由各游戏的 packages/shared 定义。

export type PlayerId = "p1" | "p2";

// 注解保持 readonly PlayerId[] 而不是 as const 元组:四个游戏原本就是这个类型,
// 收窄成元组会让下游的 .map / .find 推断结果跟着变。
export const PLAYER_IDS: readonly PlayerId[] = ["p1", "p2"];

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

/** 建房与加入房间成功后服务器回的东西,也是 rejoin 要带回来的东西。 */
export interface RoomAccepted {
  roomCode: string;
  sessionToken: string;
}

/** 服务器 -> 客户端,会话层。 */
export interface LobbyServerEvents {
  room_created: (d: RoomAccepted) => void;
  room_joined: (d: RoomAccepted) => void;
  error_msg: (e: ErrorMsg) => void;
  opponent_disconnected: () => void;
  opponent_reconnected: () => void;
  opponent_left: () => void;
}

/** 客户端 -> 服务器,会话层。 */
export interface LobbyClientEvents {
  create_room: () => void;
  join_room: (d: { roomCode: string }) => void;
  rejoin: (d: RoomAccepted) => void;
  leave_room: () => void;
}
```

- [x] **Step 6: 安装，让 npm 认到新 workspace**

Run: `npm install`
Expected：`node_modules/@tpg/protocol` 出现（指向 `platform/protocol` 的符号链接）。

```bash
ls -l node_modules/@tpg/
```

- [x] **Step 7: 跑测试确认通过**

Run: `npm test --workspace @tpg/protocol`
Expected：4 个测试全过。

- [x] **Step 8: 类型检查**

Run: `npx tsc --noEmit --project platform/protocol/tsconfig.json`
Expected：无输出（无错误）。

Step 1 的测试用 esbuild 跑，不做类型检查，所以类型契约真正的守卫是这条命令。

- [x] **Step 9: 跑全量测试确认没碰坏别的**

Run: `npm test 2>&1 | grep -E "Tests |FAIL"`
Expected：151 + 4 = 155 passed。

- [x] **Step 10: Commit**

```bash
git add platform/protocol package.json package-lock.json
git commit -m "feat(platform): add @tpg/protocol with the shared wire contract"
```

---

## Task 7: 部署跟着上移，把四个镜像修回能构建

**Files:**
- Create: `.dockerignore`（repo 根）
- Delete: `black-and-white/.dockerignore`、`flip-math/.dockerignore`、
  `add-to-fifty/.dockerignore`、`texas-poker/.dockerignore`
- Modify: 四个 `<game>/Dockerfile`
- Modify: 四个 `<game>/docker-compose.yml`

**Interfaces:**
- Consumes: Task 5 的根 workspace 布局、Task 6 的 `platform/protocol` 目录
- Produces: 四个镜像的构建上下文是 repo 根，产物路径
  `/app/<game>/packages/client/dist`。阶段 6 合并 Dockerfile 时从这个形状出发。

Task 5 删掉了 `<game>/package.json` 和 `<game>/package-lock.json`，而四个 compose
还写着 `context: .`，Dockerfile 第一句 `COPY package.json package-lock.json ./`
在游戏目录里已经找不到这两个文件。所以从 Task 5 落地起四个镜像就构建不出来，
这个 task 把它修回来。

放在 Task 6 之后而不是 Task 5 之后，是为了让 `platform/` 已经存在——这样
Dockerfile 只写一次就能把它 COPY 进去，不用先写一版没有 platform 的再改。

- [x] **Step 1: 确认现在确实是坏的**

Run: `cd black-and-white && docker compose build bw-web 2>&1 | tail -5; cd ..`
Expected：**FAIL**，报找不到 `package.json`（或 `package-lock.json`）。

先确认坏在哪，再修。Docker Desktop 没起的话先起来，否则这个 task 的每一步
都验证不了。

- [x] **Step 2: 在 repo 根建 .dockerignore**

Docker 只读构建上下文根目录的 `.dockerignore`。context 抬到 repo 根之后，
四份 `<game>/.dockerignore` 全部失效，要在根建一份。

Create `.dockerignore`：

```
# 依赖与构建产物 —— 镜像里由 npm ci / vite build 重新生成
node_modules
**/node_modules
**/dist

# 版本库与本地工具配置
.git
.gitignore
.claude
.clone
.DS_Store

# 文档不进镜像
**/*.md
docs

# 其它游戏的源码由各自的镜像构建,不需要进这一个
# (package.json 例外 —— 见 Dockerfile 的说明)
```

最后那条注释很重要：另外三个游戏的**源码**不进镜像，但它们的 `package.json`
必须进，原因见 Step 3。所以不能在 `.dockerignore` 里按游戏名排除。

- [x] **Step 3: 删掉四份旧的 .dockerignore**

```bash
cd /Users/chengminyu/Desktop/TwoPlayerGames
rm black-and-white/.dockerignore flip-math/.dockerignore \
   add-to-fifty/.dockerignore texas-poker/.dockerignore
```

- [x] **Step 4: 改 black-and-white/Dockerfile**

整个文件替换为：

```dockerfile
# syntax=docker/dockerfile:1

# 构建上下文是 repo 根(见 docker-compose.yml 的 context: ..)。
# 根 package-lock.json 覆盖全部 workspace,npm ci 要求 lockfile 与 workspace 树
# 一致,所以四个游戏的 package.json 和 platform/* 的 package.json 都要 COPY 进来
# —— 哪怕本镜像只构建其中一个游戏。代价是任一 package.json 变动会让四个镜像的
# deps 层一起失效;它们都是几百字节,源码不进来。
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY platform/protocol/package.json ./platform/protocol/
COPY black-and-white/packages/client/package.json ./black-and-white/packages/client/
COPY black-and-white/packages/server/package.json ./black-and-white/packages/server/
COPY black-and-white/packages/shared/package.json ./black-and-white/packages/shared/
COPY flip-math/packages/client/package.json ./flip-math/packages/client/
COPY flip-math/packages/server/package.json ./flip-math/packages/server/
COPY flip-math/packages/shared/package.json ./flip-math/packages/shared/
COPY add-to-fifty/packages/client/package.json ./add-to-fifty/packages/client/
COPY add-to-fifty/packages/server/package.json ./add-to-fifty/packages/server/
COPY add-to-fifty/packages/shared/package.json ./add-to-fifty/packages/shared/
COPY texas-poker/packages/client/package.json ./texas-poker/packages/client/
COPY texas-poker/packages/server/package.json ./texas-poker/packages/server/
COPY texas-poker/packages/shared/package.json ./texas-poker/packages/shared/
RUN npm ci

# ---- build the static client bundle ----
FROM deps AS client-build
COPY platform ./platform
COPY black-and-white/packages/shared ./black-and-white/packages/shared
COPY black-and-white/packages/client ./black-and-white/packages/client
RUN npm run build --workspace @bw/client
# Vite output -> /app/black-and-white/packages/client/dist

# ---- web: Caddy serving the static bundle + proxying socket.io internally ----
FROM caddy:2-alpine AS web
COPY --from=client-build /app/black-and-white/packages/client/dist /srv
COPY black-and-white/web/Caddyfile /etc/caddy/Caddyfile

# ---- server: Node running Socket.IO via tsx (shared is consumed as raw TS) ----
FROM node:22-alpine AS server
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY platform ./platform
COPY black-and-white/packages/shared ./black-and-white/packages/shared
COPY black-and-white/packages/server ./black-and-white/packages/server
EXPOSE 3001
CMD ["npm", "run", "start", "--workspace", "@bw/server"]
```

- [x] **Step 5: 改 black-and-white/docker-compose.yml**

两个 service 的 `build` 块都要加 `dockerfile`，`context` 从 `.` 改成 `..`：

```yaml
  bw-server:
    build:
      context: ..
      dockerfile: black-and-white/Dockerfile
      target: server
```

```yaml
  bw-web:
    build:
      context: ..
      dockerfile: black-and-white/Dockerfile
      target: web
```

`image`、`restart`、`expose`、`depends_on`、`networks` 都不动。

- [x] **Step 6: 构建 black-and-white 的两个镜像**

Run: `cd black-and-white && docker compose build && cd ..`
Expected：`bw-server` 和 `bw-web` 两个 target 都构建成功。

失败最可能出在 `npm ci`——如果它报 lockfile 不同步，说明漏了某个 package.json，
对着 Step 4 的 14 条 COPY 逐条核。

- [x] **Step 7: 起一次确认能玩**

Run: `cd black-and-white && docker compose up -d && cd ..`

`web` 容器没有 publish 端口（它靠共享 proxy 路由），所以要临时看一眼：

```bash
docker run --rm --network web curlimages/curl:latest -s -o /dev/null -w "%{http_code}\n" http://bw-web:80/
```

Expected：`200`

然后关掉：`cd black-and-white && docker compose down && cd ..`

- [x] **Step 8: Commit black-and-white**

```bash
git add .dockerignore black-and-white/Dockerfile black-and-white/docker-compose.yml
git rm --cached black-and-white/.dockerignore 2>/dev/null || true
git add -A black-and-white
git commit -m "build(black-and-white): move docker build context to the repo root"
```

- [x] **Step 9: 改 flip-math/Dockerfile**

和 Step 4 同样的形状，把 `black-and-white` 换成 `flip-math`、`@bw` 换成 `@fm`。
`deps` stage 的 14 条 COPY 一模一样（四个游戏全部 package.json 都要进来），
只有后三个 stage 的路径和 workspace 名变：

```dockerfile
FROM deps AS client-build
COPY platform ./platform
COPY flip-math/packages/shared ./flip-math/packages/shared
COPY flip-math/packages/client ./flip-math/packages/client
RUN npm run build --workspace @fm/client

FROM caddy:2-alpine AS web
COPY --from=client-build /app/flip-math/packages/client/dist /srv
COPY flip-math/web/Caddyfile /etc/caddy/Caddyfile

FROM node:22-alpine AS server
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY platform ./platform
COPY flip-math/packages/shared ./flip-math/packages/shared
COPY flip-math/packages/server ./flip-math/packages/server
EXPOSE 3001
CMD ["npm", "run", "start", "--workspace", "@fm/server"]
```

`deps` stage 照抄 Step 4 的那一整段（`FROM node:22-alpine AS deps` 到
`RUN npm ci`），一个字不改。

- [x] **Step 10: 改 flip-math/docker-compose.yml**

两个 service 的 `build` 块：

```yaml
      context: ..
      dockerfile: flip-math/Dockerfile
```

- [x] **Step 11: 构建并验证 flip-math**

Run: `cd flip-math && docker compose build && cd ..`
Expected：两个 target 成功。

- [x] **Step 12: Commit flip-math**

```bash
git add -A flip-math
git commit -m "build(flip-math): move docker build context to the repo root"
```

- [x] **Step 13: 改 add-to-fifty/Dockerfile**

`deps` stage 照抄 Step 4。后三个 stage：

```dockerfile
FROM deps AS client-build
COPY platform ./platform
COPY add-to-fifty/packages/shared ./add-to-fifty/packages/shared
COPY add-to-fifty/packages/client ./add-to-fifty/packages/client
RUN npm run build --workspace @add-to-fifty/client

FROM caddy:2-alpine AS web
COPY --from=client-build /app/add-to-fifty/packages/client/dist /srv
COPY add-to-fifty/web/Caddyfile /etc/caddy/Caddyfile

FROM node:22-alpine AS server
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY platform ./platform
COPY add-to-fifty/packages/shared ./add-to-fifty/packages/shared
COPY add-to-fifty/packages/server ./add-to-fifty/packages/server
EXPOSE 3001
CMD ["npm", "run", "start", "--workspace", "@add-to-fifty/server"]
```

- [x] **Step 14: 改 add-to-fifty/docker-compose.yml**

```yaml
      context: ..
      dockerfile: add-to-fifty/Dockerfile
```

- [x] **Step 15: 构建并验证 add-to-fifty**

Run: `cd add-to-fifty && docker compose build && cd ..`
Expected：两个 target 成功。

- [x] **Step 16: Commit add-to-fifty**

```bash
git add -A add-to-fifty
git commit -m "build(add-to-fifty): move docker build context to the repo root"
```

- [x] **Step 17: 改 texas-poker/Dockerfile**

`deps` stage 照抄 Step 4。后三个 stage：

```dockerfile
FROM deps AS client-build
COPY platform ./platform
COPY texas-poker/packages/shared ./texas-poker/packages/shared
COPY texas-poker/packages/client ./texas-poker/packages/client
RUN npm run build --workspace @texas-poker/client

FROM caddy:2-alpine AS web
COPY --from=client-build /app/texas-poker/packages/client/dist /srv
COPY texas-poker/web/Caddyfile /etc/caddy/Caddyfile

FROM node:22-alpine AS server
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY platform ./platform
COPY texas-poker/packages/shared ./texas-poker/packages/shared
COPY texas-poker/packages/server ./texas-poker/packages/server
EXPOSE 3001
CMD ["npm", "run", "start", "--workspace", "@texas-poker/server"]
```

- [x] **Step 18: 改 texas-poker/docker-compose.yml**

```yaml
      context: ..
      dockerfile: texas-poker/Dockerfile
```

- [x] **Step 19: 构建并验证 texas-poker**

Run: `cd texas-poker && docker compose build && cd ..`
Expected：两个 target 成功。

- [x] **Step 20: Commit texas-poker**

```bash
git add -A texas-poker
git commit -m "build(texas-poker): move docker build context to the repo root"
```

- [x] **Step 21: 四个镜像一起过一遍**

```bash
cd /Users/chengminyu/Desktop/TwoPlayerGames
for g in black-and-white flip-math add-to-fifty texas-poker; do
  echo "=== $g ==="
  (cd "$g" && docker compose build 2>&1 | tail -2)
done
```

Expected：四个都成功。这一步验的是四份 Dockerfile 的 `deps` stage 真的一字不差
——如果某份漏了一条 COPY，它的 `npm ci` 会单独失败。

- [x] **Step 22: 更新四份 DEPLOY.md 的构建命令**

四份 `DEPLOY.md` 里写的构建步骤还是老的（在游戏目录里 `docker compose build`）。
命令本身没变——还是在游戏目录里敲——但构建上下文变了，加一句说明：

> 构建上下文是 repo 根（`context: ..`），所以 `docker compose build` 会把整个
> repo 的 package.json 树读进去。命令仍在本游戏目录里敲。

（阶段 6 会把这四份 DEPLOY.md 的通用部分合并掉，这里只补这一句。）

- [x] **Step 23: Commit**

```bash
git add black-and-white/DEPLOY.md flip-math/DEPLOY.md \
        add-to-fifty/DEPLOY.md texas-poker/DEPLOY.md
git commit -m "docs: note the repo-root build context in each DEPLOY.md"
```

---

## Task 8: 四个游戏改用 @tpg/protocol

**Files:**
- Modify: `black-and-white/packages/shared/package.json`、
  `black-and-white/packages/shared/src/types.ts:5,60-71`、
  `black-and-white/packages/shared/src/game.ts:13`
- Modify: `flip-math/packages/shared/package.json`、
  `flip-math/packages/shared/src/types.ts:1,82-93`、
  `flip-math/packages/shared/src/game.ts:14`
- Modify: `add-to-fifty/packages/shared/package.json`、
  `add-to-fifty/packages/shared/src/types.ts:1,59-70`、
  `add-to-fifty/packages/shared/src/game.ts:10`
- Modify: `texas-poker/packages/shared/package.json`、
  `texas-poker/packages/shared/src/types.ts:1,130-141`、
  `texas-poker/packages/shared/src/game.ts:17`

**Interfaces:**
- Consumes: Task 6 的 `@tpg/protocol` 与 Task 7 修好的镜像构建（Task 7 的
  Dockerfile 已经把 `platform` COPY 进去，所以本 task 让游戏依赖
  `@tpg/protocol` 之后不用再改 Dockerfile）。`@tpg/protocol` 导出
  `PlayerId`、`PLAYER_IDS`、`ErrorCode`、`ErrorMsg`、`RoomAccepted`、
  `LobbyServerEvents`、`LobbyClientEvents`
- Produces: 四个游戏的 `@<scope>/shared` 继续导出同名的
  `PlayerId`、`PLAYER_IDS`、`ErrorCode`、`ErrorMsg`，所以游戏里所有
  `import type { PlayerId } from "@bw/shared"` 一句不改。这是本 task 成立的关键：
  后续阶段不需要改 import 路径。

每个游戏一组改动、一次测试、一次 commit。四组改动的形状相同，但各游戏的
`types.ts` 行号和 scope 名不同，所以下面逐个写全。

### black-and-white

- [x] **Step 1: 加依赖**

`black-and-white/packages/shared/package.json` 加一个 `dependencies` 块：

```json
  "dependencies": {
    "@tpg/protocol": "*"
  },
```

放在 `"main"` 之后、`"scripts"` 之前。`*` 是 workspace 内部依赖的写法，
和现有的 `"@bw/shared": "*"` 一致。

- [x] **Step 2: 改 types.ts**

删掉第 5 行 `export type PlayerId = "p1" | "p2";`，删掉第 60–71 行
（`export type ErrorCode = ...` 整个联合类型 + `export interface ErrorMsg { ... }`）。

在文件**最顶部**加：

```ts
import type { ErrorCode, ErrorMsg, PlayerId } from "@tpg/protocol";

// 会话层类型统一由 @tpg/protocol 定义。这里 re-export,让游戏代码里现有的
// `from "@bw/shared"` 继续有效。
export type { ErrorCode, ErrorMsg, PlayerId };
```

`import` 和 `export type` 分两句写：`PlayerId` 在本文件内部还被
`GameState`、`ClientView` 等用到，需要一个本地绑定；单写
`export type { PlayerId } from "@tpg/protocol"` 不产生本地绑定。

- [x] **Step 3: 改 game.ts**

第 13 行 `export const PLAYER_IDS: readonly PlayerId[] = ["p1", "p2"];` 改成：

```ts
import { PLAYER_IDS } from "@tpg/protocol";
export { PLAYER_IDS };
```

`import` 放到文件顶部现有 import 之后，`export` 留在原位置。
`game.ts` 内部也用 `PLAYER_IDS`，所以同样需要本地绑定。

- [x] **Step 4: 安装并测试**

Run: `npm install && npm test --workspace @bw/shared --workspace @bw/server --workspace @bw/client 2>&1 | grep -E "Tests |FAIL"`
Expected：6 + 19 + 20 = 45 passed。

- [x] **Step 5: svelte-check**

Run: `npm run check --workspace @bw/client`
Expected：`0 errors and 0 warnings`

- [x] **Step 6: 确认 ErrorCode 在 black-and-white 里只有一处定义**

```bash
grep -rn "ALREADY_IN_ROOM" black-and-white/packages/*/src/ | grep -v node_modules
```

Expected：只有 `packages/client/src/i18n.ts` 里那条中/英文案，
`packages/shared/src/types.ts` 里不该再有联合类型的成员。

- [x] **Step 7: Commit**

```bash
git add black-and-white/packages/shared package.json package-lock.json
git commit -m "refactor(black-and-white): take wire types from @tpg/protocol"
```

### flip-math

- [x] **Step 8: 加依赖**

`flip-math/packages/shared/package.json` 加：

```json
  "dependencies": {
    "@tpg/protocol": "*"
  },
```

- [x] **Step 9: 改 types.ts**

删掉第 1 行 `export type PlayerId = "p1" | "p2";`，删掉第 82–93 行
（`ErrorCode` 联合类型 + `ErrorMsg` 接口）。在文件最顶部加：

```ts
import type { ErrorCode, ErrorMsg, PlayerId } from "@tpg/protocol";

// 会话层类型统一由 @tpg/protocol 定义。这里 re-export,让游戏代码里现有的
// `from "@fm/shared"` 继续有效。
export type { ErrorCode, ErrorMsg, PlayerId };
```

- [x] **Step 10: 改 game.ts**

第 14 行 `export const PLAYER_IDS: readonly PlayerId[] = ["p1", "p2"];` 改成：

```ts
import { PLAYER_IDS } from "@tpg/protocol";
export { PLAYER_IDS };
```

注意 `game.ts` 顶部已经有 `import { WIN_SCORE } from "./config";`，
新的 import 加在它旁边。

- [x] **Step 11: 安装并测试**

Run: `npm install && npm test --workspace @fm/shared --workspace @fm/server --workspace @fm/client 2>&1 | grep -E "Tests |FAIL"`
Expected：6 + 9 + 37 = 52 passed。

- [x] **Step 12: svelte-check**

Run: `npm run check --workspace @fm/client`
Expected：`0 errors and 0 warnings`

- [x] **Step 13: Commit**

```bash
git add flip-math/packages/shared package.json package-lock.json
git commit -m "refactor(flip-math): take wire types from @tpg/protocol"
```

### add-to-fifty

- [x] **Step 14: 加依赖**

`add-to-fifty/packages/shared/package.json` 加：

```json
  "dependencies": {
    "@tpg/protocol": "*"
  },
```

- [x] **Step 15: 改 types.ts**

删掉第 1 行 `export type PlayerId = "p1" | "p2";`，删掉第 59–70 行
（`ErrorCode` 联合类型 + `ErrorMsg` 接口）。在文件最顶部加：

```ts
import type { ErrorCode, ErrorMsg, PlayerId } from "@tpg/protocol";

// 会话层类型统一由 @tpg/protocol 定义。这里 re-export,让游戏代码里现有的
// `from "@add-to-fifty/shared"` 继续有效。
export type { ErrorCode, ErrorMsg, PlayerId };
```

- [x] **Step 16: 改 game.ts**

第 10 行 `export const PLAYER_IDS: readonly PlayerId[] = ["p1", "p2"];` 改成：

```ts
import { PLAYER_IDS } from "@tpg/protocol";
export { PLAYER_IDS };
```

- [x] **Step 17: 安装并测试**

Run: `npm install && npm test --workspace @add-to-fifty/shared --workspace @add-to-fifty/server --workspace @add-to-fifty/client 2>&1 | grep -E "Tests |FAIL"`
Expected：6 + 6 + 11 = 23 passed。

- [x] **Step 18: svelte-check**

Run: `npm run check --workspace @add-to-fifty/client`
Expected：`0 errors and 0 warnings`

- [x] **Step 19: Commit**

```bash
git add add-to-fifty/packages/shared package.json package-lock.json
git commit -m "refactor(add-to-fifty): take wire types from @tpg/protocol"
```

### texas-poker

- [x] **Step 20: 加依赖**

`texas-poker/packages/shared/package.json` 加（Task 4 把这个文件的
`dependencies` 整块删了，现在重新加回来，只有这一条）：

```json
  "dependencies": {
    "@tpg/protocol": "*"
  },
```

- [x] **Step 21: 改 types.ts**

删掉第 1 行 `export type PlayerId = "p1" | "p2";`，删掉第 130–141 行
（`ErrorCode` 联合类型 + `ErrorMsg` 接口）。在文件最顶部加：

```ts
import type { ErrorCode, ErrorMsg, PlayerId } from "@tpg/protocol";

// 会话层类型统一由 @tpg/protocol 定义。这里 re-export,让游戏代码里现有的
// `from "@texas-poker/shared"` 继续有效。
export type { ErrorCode, ErrorMsg, PlayerId };
```

- [x] **Step 22: 改 game.ts**

第 17 行 `export const PLAYER_IDS: readonly PlayerId[] = ["p1", "p2"];` 改成：

```ts
import { PLAYER_IDS } from "@tpg/protocol";
export { PLAYER_IDS };
```

`game.ts` 里有 6 处内部使用 `PLAYER_IDS`（第 157、211、248、448、450、489 行），
靠上面这个 import 的本地绑定继续工作，那六处一行不改。

- [x] **Step 23: 安装并测试**

Run: `npm install && npm test --workspace @texas-poker/shared --workspace @texas-poker/server --workspace @texas-poker/client 2>&1 | grep -E "Tests |FAIL"`
Expected：6 + 8 + 17 = 31 passed。

- [x] **Step 24: svelte-check**

Run: `npm run check --workspace @texas-poker/client`
Expected：`0 ERRORS 0 WARNINGS`

- [x] **Step 25: Commit**

```bash
git add texas-poker/packages/shared package.json package-lock.json
git commit -m "refactor(texas-poker): take wire types from @tpg/protocol"
```

### 全量验收

- [x] **Step 26: 全量测试**

Run: `npm test 2>&1 | grep -E "Tests |FAIL"`
Expected：155 passed（151 + protocol 的 4）。

- [x] **Step 27: 全量 svelte-check**

Run: `npm run check 2>&1 | grep -iE "errors|warnings|ERRORS"`
Expected：四个 client 各 0 errors 0 warnings。

- [x] **Step 28: 确认 ErrorCode 全 repo 只定义一次**

```bash
grep -rn "\"ALREADY_IN_ROOM\"\|'ALREADY_IN_ROOM'" \
  platform/*/src */packages/*/src 2>/dev/null | grep -v node_modules
```

Expected：`platform/protocol/src/index.ts` 一处定义，加上四个游戏
`i18n.ts` 里各一对中英文案（文案在阶段 4 才合并，这里还是 8 处）。
`*/packages/shared/src/types.ts` 里一处都不该有。

- [x] **Step 29: 四个 dev server 冒烟**

逐个 preview_start 四个 client，`read_page` 确认大厅渲染，
`read_console_messages` 带 `onlyErrors: true` 确认无 Svelte 报错。

- [x] **Step 30: 格式化检查**

Run: `npm run format:check`
Expected：通过。不通过就 `npm run format` 修掉，然后补一个
`style: prettier` 的 commit。

---

# 阶段 1 & 2 完成后的状态

- repo 根是唯一 workspace root，一份 `node_modules`、一份 `package-lock.json`，
  `find . -name node_modules` 只有一行。
- 四个游戏都在 Svelte 5.56 / Vite 8.2 / Vitest 4.1 上，零嵌套。
- `platform/protocol` 是第一个共享包，`ErrorCode` 与 `PlayerId` 在整个 repo
  只定义一次。
- 155 个测试全过，四个 `svelte-check` 各 0 errors 0 warnings，
  四个大厅在浏览器里渲染正常。
- 四个镜像能构建、能起、能玩。构建上下文是 repo 根，`.dockerignore` 在根，
  四份 Dockerfile 的 `deps` stage 一字不差。
- 唯一的破窗期是 Task 5 到 Task 7 之间（root 上移之后、部署修好之前），
  这三个 task 之间不要停下来发版。

阶段 6 剩下的活变小了：把四份形状相同的 Dockerfile 合并成
`platform/deploy/Dockerfile` 一份（靠 `ARG GAME_DIR` / `ARG SCOPE` 传参），
四份 `web/Caddyfile` 合并成一份（靠 `{$GAME_SERVER}` 传参），
四份 `DEPLOY.md` 的通用部分抽到 `platform/deploy/README.md`。
四份 `docker-compose.yml` 按 spec 的决定保留。
