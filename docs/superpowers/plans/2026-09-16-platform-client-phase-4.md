# 阶段 4：platform/client 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把四个游戏客户端里逐份重写的会话管线、i18n 引擎和词典 parity 测试抽成 `@tpg/client`，让四份 `socket.ts` 从 397 行降到 60 行以内，四份 `i18n.test.ts` 从 237 行降到 40 行以内。

**Architecture:** 新增一个 source-only 包 `platform/client`（包名 `@tpg/client`，`main: "src/index.ts"`，由各游戏的 vite/vitest 自己编译 TS），里面四个模块：`i18n.ts`（`Lang` / `resolveLang` / `createI18n`）、`dict.ts`（`StatusCode` / `EndedCode` / `LobbyDict` / `sharedStatus` / `sharedLobby`）、`testing.ts`（词典 parity check）、`roomSession.ts`（`createRoomSession`）。各游戏的 `socket.ts` 和 `i18n.ts` 变成薄壳：调一次工厂函数，再把结果按原来的名字 re-export —— 所以除 texas-poker 的大厅词条改名外，**没有任何组件需要改**。

**Tech Stack:** TypeScript 5 ｜ svelte/store（`writable` / `derived`）｜ socket.io-client 4 ｜ Vitest 4 ｜ npm workspaces

**Spec:** `docs/superpowers/specs/2026-09-16-platform-extraction-design.md`（阶段 4 在 4.1–4.5 节）

---

## Global Constraints

阶段 1–3 立下的约束继续生效，每个 task 的要求都隐含这一节：

- **npm ≥ 11。** npm 10.9.2 的 arborist 在这个 workspace 规模下会崩（`Cannot read properties of null (reading 'edgesOut')`，在 `#loadPeerSet` 里）。本机是 11.19.1。**不要给 `@tpg/client` 加 `peerDependencies`** —— 那个 bug 就在 peer set 的加载路径上，没必要去碰。
- **镜像里的 npm 10 不用动。** 已验证 npm 10.9.2 的 `npm ci` 能吃 npm 11 生成的 lockfile（都是 lockfileVersion 3）。
- **`svelte.config.js` 的 `runes: false` 不能删。** 四个 client 都靠它，Svelte 5.57 默认按 runes 模式编译，`$t` 会变成非法变量名。
- **四个 client 的 `tsconfig.json` 保留 `verbatimModuleSyntax: true`**（svelte-check 4.7.6 要求）。所以类型导入一律写 `import type`。
- **客户端改动只有浏览器能判对错。** svelte-check 抓不到运行时的接线错误（阶段 1 已证实：`new App(...)` 在 Svelte 5 下必然崩，svelte-check 报 0 error）。每个游戏迁移完必须在浏览器里真打一局。
- **localStorage 的 key 前缀一个字都不能变**：`bw` / `fm` / `add2fifty` / `texas_poker`。拼接规则保持 `` `${prefix}_token` `` 和 `` `${prefix}_room` ``，语言 key 保持 `bw_lang` / `fm_lang` / `add2fifty_lang` / `texas_poker_lang`。改了就等于上线那一刻把所有正在打的局踢回大厅。
- **四个游戏的 `packages/server/test/integration.test.ts` 不许改。** 它们是抽取正确性的判据。
- **服务器权威不能松**：伪造的 `sessionToken`、满房、非法动作仍然要被拒。本阶段不碰服务器。
- **不要 `git push`。** 提交由本计划里的 message 逐个敲，推送由用户自己做。

---

## 与 spec 的五处不一致（读代码之后才发现的，按这里写的做）

spec 的 4.1–4.4 是在没有逐字比对四份词典之前写的。实际比对（`status` / `ended` 两块做过 sha256 分组）之后有五处要改。**下面是准，spec 的原文不是。**

**1. `ended.OPPONENT_LEFT` 不是共享文案，三个版本。** spec 4.3 说它和 `status` 一样四份一致；实测不是：

| 游戏 | en | zh |
| --- | --- | --- |
| bw, fm | `Your opponent left the game. You win 🎉` | `对手已退出本局，你获胜 🎉` |
| a2f | `Your opponent left the game. You win` | `对手已退出本局，你获胜` |
| tp | `Your opponent left the match` | `对手已退出牌局` |

tp 那份是**语义上**不同，不是笔误：德州扑克里对手中途退出不等于你赢，筹码才算。a2f 整份词典都不用 emoji（`win: "你赢了"`，没有 🎉），给它塞一个反而和自己不一致。所以 `ended` 的**文案留在各游戏**，共享的只有 `EndedCode` 类型和 `satisfies Record<EndedCode, string>` 这道检查。

**2. `status` 的 8 条确实四份一致，但中文有一个字符的分歧。** en 八条 sha256 完全相同。zh 里 bw/fm 写 `对手掉线，等待重连…`（U+2026），a2f/tp 写 `对手掉线，等待重连...`（三个 ASCII 点），其余 7 条逐字相同。共享版本取 `…`：a2f 和 tp 的中文词典本来就基本不用句末省略号（`等待第二位玩家加入` 没有），这一条是当初随手打的，统一成排版正确的那个。

**3. `sharedDict.lobby` 降级成「形状契约 + 7 条共享文案」。** spec 想让大厅整组文案共享，但四个游戏的大厅文案有真实分歧：`waitingOpponent` 一位上 bw 写的是「发给朋友，等待对手加入…」（让玩家去分享房间码），fm 写「等待对手加入…」，a2f/tp 写「等待第二位玩家加入」。这三种说的不是一件事，给默认值再让三个游戏覆盖，等于共享了一个没人用的值。所以：`LobbyDict` 是**形状契约**（8 个 key，各游戏的 `lobby` 必须满足），`sharedLobby` 只给其中 7 条真正该统一的文案，`waitingOpponent` 由契约要求、各游戏自己提供。

**4. texas-poker 的 `status.set(null)` 不能照搬进框架 —— 它是个 bug。** spec 4.1「顺带统一的一处行为」说 tp 在 `view_update` 里多的那句 `status.set(null)` 是对的，四个都该采用。不对：`status` 同时装两种东西 —— 我这边的操作报错（`INVALID_MOVE` 之类，下一条视图到了就该清）和**对手**的掉线通知（`OPPONENT_DISCONNECTED`，要留到 `opponent_reconnected` 才清）。无条件清掉，掉线横幅就活不过下一条视图。

对手不在时视图照样会来，两个来源：我还能继续动（bw 出牌、a2f 出牌、tp 跟注都不要求双方在线），以及服务器自己推（flip-math 的计时器每次状态转移都广播）。谁看得见这个 bug 取决于各游戏在哪儿渲染 `status`：bw 在 `Table.svelte`、a2f 和 tp 在 `App.svelte` 里就渲染，牌局界面上横幅会当场消失；fm 只在 `Lobby.svelte` 和 `GameOver.svelte` 渲染它，所以在 fm 里影响只落在 store 上，界面看不出来。框架改成只清前一种：

```ts
status.update((s) => (s === "OPPONENT_DISCONNECTED" ? s : null));
```

这对 bw/fm/a2f 是新增行为（它们原来在 `view_update` 里完全不动 `status`，陈旧的报错横幅会一直挂着），对 tp 是收窄。Task 4 有两条测试钉住这条规则，Task 8 在 tp 的浏览器验收里看一次实际效果 —— 四个游戏里只有它原来带着这个 bug。

**5. spec 4.1 里 bw 的示例漏了 `ended.set(null)`。** 四个游戏的 `view_update` 都会清 `ended`，只是 guard 不同：bw 用 `phase === "playing"`，另三个用 `phase !== "finished"`。框架采用 `!== "finished"`（三比一），bw 的 `onView` 只留 `review.set(null)`。

这不会改 bw 的行为，理由要能说出来：`ended` 只由 `opponent_left` 事件置上，而服务器只在 `leave_room` 里发它，发完立刻 `rooms.delete(myRoom)`（`platform/server/src/gameServer.ts:227-238`）。房间一删，剩下那个 socket 再也收不到任何 `view_update`。所以 `ended` 非空之后根本没有视图会到达，两个 guard 判得出不同结果的那个场景（`phase === "waiting"` 的视图 + 非空 `ended`）不存在。真要出现，也只可能是玩家不经 `leaveRoom` 直接建了新房 —— 这时候新框架会清掉残留的终局遮罩，旧的 bw 规则不会清，所以换过去只会更稳，不会更糟。

**另外一处（不是 spec 的错，是 TS 的约束）：texas-poker 的 `lobby.subtitle` 必须挪到顶层。** `satisfies LobbyDict` 会对字面量做 excess property check，即便前面有展开也一样 —— 已用 tsc 验证：`{ ...shared, b: "B", subtitle: "S" } satisfies LobbyDict` 报 `TS2353: Object literal may only specify known properties, and 'subtitle' does not exist in type 'LobbyDict'`。bw 本来就把副标题放在顶层（`en.subtitle`），tp 跟着挪就是了。

---

## File Structure

**新建 —— `platform/client`，一个 source-only 包（和 `@tpg/protocol` / `@tpg/server` 同一种形态）：**

| 文件 | 职责 | 约 |
| --- | --- | --- |
| `platform/client/package.json` | 包声明。`main: "src/index.ts"`，消费者自己编译 TS | 20 行 |
| `platform/client/tsconfig.json` | `lib: ["ESNext","DOM"]`（要 localStorage / document / navigator） | 15 行 |
| `platform/client/src/index.ts` | re-export 门面 | 15 行 |
| `platform/client/src/i18n.ts` | `Lang`、`resolveLang`、`createI18n` | 60 行 |
| `platform/client/src/dict.ts` | `StatusCode`、`EndedCode`、`LobbyDict`、`sharedStatus`、`sharedLobby` | 70 行 |
| `platform/client/src/testing.ts` | `dictParityIssues`、`assertDictParity` | 60 行 |
| `platform/client/src/roomSession.ts` | `createRoomSession` | 120 行 |
| `platform/client/test/testing.test.ts` | 9 个 | 110 行 |
| `platform/client/test/i18n.test.ts` | 6 个 | 55 行 |
| `platform/client/test/dict.test.ts` | 3 个 | 40 行 |
| `platform/client/test/roomSession.test.ts` | 20 个 | 230 行 |

依赖方向：`roomSession.ts → dict.ts → i18n.ts`（只要 `Lang`），`testing.ts` 谁都不依赖。所以 task 顺序是 testing → i18n → dict → roomSession，每个 task 落地时它依赖的东西都已经在了。

**改写 —— 每个游戏两个文件加一个测试：**

| 文件 | 现在 | 之后 |
| --- | --- | --- |
| `black-and-white/packages/client/src/socket.ts` | 96 行 | 22 行 |
| `flip-math/packages/client/src/socket.ts` | 113 行 | 46 行 |
| `add-to-fifty/packages/client/src/socket.ts` | 86 行 | 18 行 |
| `texas-poker/packages/client/src/socket.ts` | 102 行 | 26 行 |
| 四个 `src/i18n.ts` | 各含 40 行引擎 + 重复词条 | 引擎和共享词条都来自 `@tpg/client` |
| 四个 `test/i18n.test.ts` | 各 58–61 行 | 各 10 行 |

**顺带改的组件（只有两处）：** `black-and-white/.../lib/Lobby.svelte` 的 `$t.lobby.sharePrompt` → `waitingOpponent`；`texas-poker/.../lib/Lobby.svelte` 的 `copy.create` / `copy.dissolve` / `copy.waiting` / `copy.subtitle` 和那个拿 `copy.roomCode` 当 placeholder 的 input。

**部署文件：** 四个 `Dockerfile` 的 deps 阶段各加一行 `COPY platform/client/package.json ./platform/client/`。`npm ci` 要求 lockfile 和 workspace 树一致，`platform/client` 一进 lockfile，镜像里少了它的 package.json 就 `npm ci` 失败 —— 所以这一行必须和建包**同一个 commit**，不能拖到阶段末尾。

**不需要改的：** 根 `package.json` 的 `workspaces` 已经是 `["platform/*", ...]`，`platform/client` 自动命中。`@source` 指令也不用加 —— `@tpg/client` 里没有 `.svelte` 文件，没有 Tailwind 类要扫（那是阶段 5 的事）。

---

### Task 1: @tpg/client 骨架 + 词典 parity check

**Files:**
- Create: `platform/client/package.json`
- Create: `platform/client/tsconfig.json`
- Create: `platform/client/src/testing.ts`
- Create: `platform/client/src/index.ts`
- Create: `platform/client/test/testing.test.ts`
- Modify: `black-and-white/Dockerfile:13`、`flip-math/Dockerfile`、`add-to-fifty/Dockerfile`、`texas-poker/Dockerfile`（deps 阶段各加一行）
- Modify: `package-lock.json`（`npm install` 生成）

**Interfaces:**
- Consumes: 无（这是本阶段第一块砖）
- Produces: `dictParityIssues<D>(en: D, zh: D, opts?: ParityOptions): string[]`、`assertDictParity<D>(en: D, zh: D, opts?: ParityOptions): void`、`interface ParityOptions { sharedByDesign?: string[] }`。Task 3 的 `dict.test.ts` 和 Task 5–8 的四个 `i18n.test.ts` 都用它。

- [ ] **Step 1: 建包目录与 package.json**

```bash
mkdir -p platform/client/src platform/client/test
```

`platform/client/package.json`：

```json
{
  "name": "@tpg/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "@tpg/protocol": "*",
    "socket.io-client": "^4.7.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "svelte": "^5.56.8",
    "typescript": "^5.4.0",
    "vitest": "^4.1.10"
  }
}
```

`svelte` 放 devDependencies 而不是 peerDependencies：消费者（四个 client）自己都有 svelte，bundle 时从它们的树里解析；而 peer 声明会把 npm 的 peer set 加载路径拖进来，阶段 1 崩的就是那条路径（`#loadPeerSet`）。

- [ ] **Step 2: tsconfig.json**

抄 `platform/server/tsconfig.json`，两处不同：`lib` 要 `DOM`（用到 `localStorage` / `document` / `navigator` / `Storage`），`types` 空着（不是 node 代码）。

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
    "types": [],
    "lib": ["ESNext", "DOM"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: 写失败的测试**

`platform/client/test/testing.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { assertDictParity, dictParityIssues } from "../src/testing";

const en = {
  title: "Game",
  lobby: { join: "Join", cancel: "Cancel" },
  cardsLeft: (n: number) => `${n} left`,
};

const zh = {
  title: "Game",
  lobby: { join: "加入", cancel: "取消" },
  cardsLeft: (n: number) => `剩 ${n} 张`,
};

describe("dictParityIssues", () => {
  it("一致的两份词典没有问题", () => {
    expect(dictParityIssues(en, zh, { sharedByDesign: ["title"] })).toEqual([]);
  });

  it("zh 少一个 key 会被按路径报出来", () => {
    const short = { ...zh, lobby: { join: "加入" } };
    expect(dictParityIssues(en, short as typeof zh)).toContain(
      "zh 缺 key: lobby.cancel",
    );
  });

  it("zh 多一个 key 会被报出来", () => {
    const long = { ...zh, lobby: { ...zh.lobby, extra: "多的" } };
    expect(dictParityIssues(en, long as unknown as typeof zh)).toContain(
      "zh 多出 key: lobby.extra",
    );
  });

  it("zh 原样照抄 en 算漏翻", () => {
    const lazy = { ...zh, lobby: { ...zh.lobby, join: "Join" } };
    expect(dictParityIssues(en, lazy)).toContain("漏翻: lobby.join");
  });

  it("sharedByDesign 里的 key 允许中英同字", () => {
    // title 两边都是 "Game",不列进 sharedByDesign 就该报漏翻。
    expect(dictParityIssues(en, zh)).toContain("漏翻: title");
    expect(dictParityIssues(en, zh, { sharedByDesign: ["title"] })).toEqual([]);
  });

  it("函数条目的 arity 不一致会被报出来", () => {
    const wrongArity = { ...zh, cardsLeft: () => "剩牌" };
    expect(
      dictParityIssues(en, wrongArity as unknown as typeof zh, {
        sharedByDesign: ["title"],
      }),
    ).toContain("arity 不一致: cardsLeft (en 1 / zh 0)");
  });

  it("函数条目 arity 一致时不报,也不当成漏翻", () => {
    const issues = dictParityIssues(en, zh, { sharedByDesign: ["title"] });
    expect(issues.filter((i) => i.includes("cardsLeft"))).toEqual([]);
  });
});

describe("assertDictParity", () => {
  it("有问题时抛错,消息里带上路径", () => {
    const lazy = { ...zh, lobby: { ...zh.lobby, join: "Join" } };
    expect(() => assertDictParity(en, lazy, { sharedByDesign: ["title"] })).toThrow(
      /lobby\.join/,
    );
  });

  it("没问题时不抛", () => {
    expect(() =>
      assertDictParity(en, zh, { sharedByDesign: ["title"] }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 4: 跑测试确认失败**

Run: `npm test --workspace @tpg/client`
Expected: FAIL —— `Failed to resolve import "../src/testing"`（文件还没建）。

若报的是 `npm error Workspace not found`，说明 Step 6 的 `npm install` 还没跑；先跳到 Step 6 再回来。

- [ ] **Step 5: 写实现**

`platform/client/src/testing.ts`：

```ts
// 给各游戏的 i18n.test.ts 用。刻意不 import vitest —— 这个模块从 src/index.ts
// 导出,而 index 会被 vite 打进生产 bundle。抛普通 Error,任何 runner 都能报。

export interface ParityOptions {
  /** 有意中英同字的 key path。比如 title 是已上线的英文产品名。 */
  sharedByDesign?: string[];
}

// 并行走两棵词典,所以漏掉或打错的 key 是按路径报出来的,不是一句
// "objects differ"。函数是叶子(typeof fn 不是 "object")。
function keyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

function read(dict: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc as never)[k], dict);
}

/**
 * parity check:两份词典的问题清单,空数组表示通过。查三件事 ——
 * key 树一致、带参词条的参数个数一致、zh 没有原样照抄 en。
 */
export function dictParityIssues<D>(
  en: D,
  zh: D,
  opts: ParityOptions = {},
): string[] {
  const shared = new Set(opts.sharedByDesign ?? []);
  const enPaths = keyPaths(en);
  const enSet = new Set(enPaths);
  const zhPaths = keyPaths(zh);
  const zhSet = new Set(zhPaths);
  const issues: string[] = [];

  for (const p of enPaths) if (!zhSet.has(p)) issues.push(`zh 缺 key: ${p}`);
  for (const p of zhPaths) if (!enSet.has(p)) issues.push(`zh 多出 key: ${p}`);

  for (const p of enPaths) {
    if (!zhSet.has(p)) continue;
    const e = read(en, p);
    const z = read(zh, p);
    if (typeof e === "function" && typeof z === "function") {
      if (e.length !== z.length) {
        issues.push(`arity 不一致: ${p} (en ${e.length} / zh ${z.length})`);
      }
      continue;
    }
    if (typeof e === "string" && typeof z === "string" && e === z) {
      if (!shared.has(p)) issues.push(`漏翻: ${p}`);
    }
  }
  return issues;
}

export function assertDictParity<D>(
  en: D,
  zh: D,
  opts: ParityOptions = {},
): void {
  const issues = dictParityIssues(en, zh, opts);
  if (issues.length > 0) {
    throw new Error(`词典中英不一致:\n  ${issues.join("\n  ")}`);
  }
}
```

`platform/client/src/index.ts`（本 task 只有 testing 一块，后面三个 task 往上加）：

```ts
export { assertDictParity, dictParityIssues } from "./testing";
export type { ParityOptions } from "./testing";
```

- [ ] **Step 6: 装进 workspace**

Run: `npm install`
Expected: 输出里有 `added ... packages`，且 `ls -la node_modules/@tpg/` 里出现 `client -> ../../platform/client` 的符号链接。

```bash
npm install && ls -l node_modules/@tpg/
```

不要用 `--silent`：阶段 1 踩过一次，`--silent` 会把 npm 自己的报错吞掉，让基于 grep 的成功判断给出假的绿灯。

- [ ] **Step 7: 跑测试确认通过**

Run: `npm test --workspace @tpg/client`
Expected: PASS，`Tests 9 passed (9)`。

- [ ] **Step 8: typecheck**

Run: `npm run typecheck --workspace @tpg/client`
Expected: 无输出，exit 0。

- [ ] **Step 9: 四个 Dockerfile 的 deps 阶段各加一行**

在 `COPY platform/server/package.json ./platform/server/` 后面插入一行。四个文件同样处理：

```bash
for g in black-and-white flip-math add-to-fifty texas-poker; do
  perl -0pi -e 's{(COPY platform/server/package\.json \./platform/server/\n)}{$1COPY platform/client/package.json ./platform/client/\n}' "$g/Dockerfile"
done
grep -c "platform/client/package.json" black-and-white/Dockerfile flip-math/Dockerfile add-to-fifty/Dockerfile texas-poker/Dockerfile
```

Expected: 四个文件各 `1`。

改完确认四个 deps 阶段仍然逐字相同（阶段 1 立的性质，靠它保证四个镜像的缓存行为一致）：

```bash
for g in black-and-white flip-math add-to-fifty texas-poker; do
  sed -n '/^FROM node:22-alpine AS deps/,/^RUN npm ci/p' "$g/Dockerfile" | shasum | cut -c1-12
done
```

Expected: 四行同一个哈希。

- [ ] **Step 10: 验证镜像仍然能构建**

只构建 deps 阶段，几秒钟，用来证明 `npm ci` 没被新 workspace 弄坏：

```bash
docker build --target deps -f black-and-white/Dockerfile -t tpg-deps-check . && echo "deps stage OK"
```

Expected: 结尾打出 `deps stage OK`。

- [ ] **Step 11: format + commit**

```bash
npx prettier --write platform/client
npm run format:check
git add platform/client package-lock.json black-and-white/Dockerfile flip-math/Dockerfile add-to-fifty/Dockerfile texas-poker/Dockerfile
git commit -m "feat(platform): add @tpg/client with the dictionary parity check"
```

---

### Task 2: i18n 引擎

**Files:**
- Create: `platform/client/src/i18n.ts`
- Create: `platform/client/test/i18n.test.ts`
- Modify: `platform/client/src/index.ts`

**Interfaces:**
- Consumes: 无
- Produces: `type Lang = "en" | "zh"`、`resolveLang(saved: string | null, navigatorLang: string): Lang`、`createI18n<D extends { title: string }>(opts: { storageKey: string; dict: Record<Lang, D> }): { lang: Writable<Lang>; t: Readable<D>; toggleLang(): void }`。Task 3 的 `dict.ts` 要 `Lang`，Task 5–8 四个游戏的 `i18n.ts` 要 `createI18n`。

- [ ] **Step 1: 写失败的测试**

`platform/client/test/i18n.test.ts`。前四条是从四份 `i18n.test.ts` 里搬过来的（原来一模一样抄了四遍），后两条是新的：

```ts
import { describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { createI18n, resolveLang } from "../src/i18n";

describe("resolveLang", () => {
  it("非中文浏览器回退到英文", () => {
    expect(resolveLang(null, "en-US")).toBe("en");
    expect(resolveLang(null, "fr-FR")).toBe("en");
    expect(resolveLang(null, "ja")).toBe("en");
  });

  it("任何地区的中文浏览器都给中文", () => {
    expect(resolveLang(null, "zh-CN")).toBe("zh");
    expect(resolveLang(null, "zh-TW")).toBe("zh");
    expect(resolveLang(null, "ZH")).toBe("zh");
  });

  it("存下来的选择覆盖检测,两个方向都覆盖", () => {
    expect(resolveLang("en", "zh-CN")).toBe("en");
    expect(resolveLang("zh", "en-US")).toBe("zh");
  });

  it("坏掉的存档值被忽略", () => {
    expect(resolveLang("klingon", "en-US")).toBe("en");
    expect(resolveLang("", "zh-CN")).toBe("zh");
  });
});

describe("createI18n", () => {
  const dict = {
    en: { title: "Game", greet: "Hi" },
    zh: { title: "游戏", greet: "嗨" },
  };

  it("没有 window 的环境里给英文", () => {
    // 这个测试跑在 node 里,没有 window,所以走的是 inBrowser 为假那条路 ——
    // 也是 vite build 做 SSR 预渲染时走的那条。
    const { lang } = createI18n({ storageKey: "x_lang", dict });
    expect(get(lang)).toBe("en");
  });

  it("t 跟着 lang 走", () => {
    const { lang, t } = createI18n({ storageKey: "x_lang", dict });
    expect(get(t).greet).toBe("Hi");
    lang.set("zh");
    expect(get(t).greet).toBe("嗨");
  });
});
```

`toggleLang` 不测：它要写 `localStorage`，而这个包的测试跑在 node 里、没有 DOM。为它引一个 jsdom 不值得 —— 四个游戏今天也没测它，而它的逻辑就是 `lang.update` 加一次 `setItem`。浏览器验收（Task 5–8 每个游戏点一次语言开关并刷新）覆盖它。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test --workspace @tpg/client`
Expected: FAIL —— `Failed to resolve import "../src/i18n"`。

- [ ] **Step 3: 写实现**

`platform/client/src/i18n.ts`。这是四份 `i18n.ts` 尾部那 40 行引擎的逐字搬迁，唯一的改动是把两个写死的常量（`STORAGE_KEY`、`dict`）变成参数：

```ts
import { derived, writable, type Readable, type Writable } from "svelte/store";

export type Lang = "en" | "zh";

/**
 * 纯函数,不碰 DOM,所以能直接测。英文是 fallback:
 * 只有浏览器真的要中文才给中文。
 */
export function resolveLang(saved: string | null, navigatorLang: string): Lang {
  if (saved === "en" || saved === "zh") return saved;
  return navigatorLang.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export interface I18nOptions<D> {
  /** localStorage key。必须沿用各游戏现有值(bw_lang / fm_lang / ...)。 */
  storageKey: string;
  dict: Record<Lang, D>;
}

export interface I18n<D> {
  lang: Writable<Lang>;
  t: Readable<D>;
  toggleLang(): void;
}

/** D 要有 title,因为语言一换就要跟着改 document.title。 */
export function createI18n<D extends { title: string }>(
  opts: I18nOptions<D>,
): I18n<D> {
  const inBrowser = typeof window !== "undefined";

  const lang = writable<Lang>(
    inBrowser
      ? resolveLang(localStorage.getItem(opts.storageKey), navigator.language)
      : "en",
  );

  if (inBrowser) {
    lang.subscribe((l) => {
      document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
      document.title = opts.dict[l].title;
    });
  }

  /**
   * 只在玩家明确切换时才写 localStorage —— 在他表态之前,
   * 浏览器语言检测一直有效。
   */
  function toggleLang(): void {
    lang.update((l) => {
      const next: Lang = l === "zh" ? "en" : "zh";
      localStorage.setItem(opts.storageKey, next);
      return next;
    });
  }

  return { lang, t: derived(lang, ($l) => opts.dict[$l]), toggleLang };
}
```

- [ ] **Step 4: 加进 index.ts**

```ts
export { assertDictParity, dictParityIssues } from "./testing";
export type { ParityOptions } from "./testing";
export { createI18n, resolveLang } from "./i18n";
export type { I18n, I18nOptions, Lang } from "./i18n";
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test --workspace @tpg/client`
Expected: PASS，`Tests 15 passed (15)`（9 + 6）。

- [ ] **Step 6: typecheck + commit**

```bash
npm run typecheck --workspace @tpg/client
npx prettier --write platform/client
git add platform/client
git commit -m "feat(platform): add the shared i18n engine"
```

---

### Task 3: 共享词条

**Files:**
- Create: `platform/client/src/dict.ts`
- Create: `platform/client/test/dict.test.ts`
- Modify: `platform/client/src/index.ts`

**Interfaces:**
- Consumes: `Lang`（Task 2）、`dictParityIssues`（Task 1）
- Produces: `type StatusCode = ErrorCode | "OPPONENT_DISCONNECTED"`、`type EndedCode = "OPPONENT_LEFT"`、`interface LobbyDict`（8 个 string 字段）、`const sharedStatus: Record<Lang, Record<StatusCode, string>>`、`const sharedLobby: Record<Lang, Omit<LobbyDict, "waitingOpponent">>`。Task 4 的 `roomSession.ts` 要两个 code 类型，Task 5–8 四个游戏的 `i18n.ts` 要两个 shared 常量加 `LobbyDict`。

- [ ] **Step 1: 写失败的测试**

`platform/client/test/dict.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { sharedLobby, sharedStatus, type StatusCode } from "../src/dict";
import { dictParityIssues } from "../src/testing";

// 写死这 8 个 code,而不是从类型推 —— 类型在运行时不存在,而这份清单的作用
// 正是当第二个证人:@tpg/protocol 里的 ErrorCode 加一条,这里就该红。
const CODES: StatusCode[] = [
  "OPPONENT_DISCONNECTED",
  "ALREADY_IN_ROOM",
  "INVALID_REQUEST",
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "INVALID_SESSION",
  "INVALID_MOVE",
  "OPPONENT_GONE",
];

describe("sharedStatus", () => {
  it("每个 StatusCode 中英都有文案", () => {
    for (const code of CODES) {
      expect(sharedStatus.en[code], `en ${code}`).toBeTruthy();
      expect(sharedStatus.zh[code], `zh ${code}`).toBeTruthy();
    }
    expect(Object.keys(sharedStatus.en).sort()).toEqual([...CODES].sort());
  });

  it("中英形状一致且都翻译过", () => {
    expect(dictParityIssues(sharedStatus.en, sharedStatus.zh)).toEqual([]);
  });
});

describe("sharedLobby", () => {
  it("中英形状一致且都翻译过", () => {
    expect(dictParityIssues(sharedLobby.en, sharedLobby.zh)).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test --workspace @tpg/client`
Expected: FAIL —— `Failed to resolve import "../src/dict"`。

- [ ] **Step 3: 写实现**

`platform/client/src/dict.ts`。`status` 的 8 条中英文案从四个游戏里逐字搬过来（en 四份 sha256 相同；zh 取 bw/fm 那份，即 `OPPONENT_DISCONNECTED` 用 `…`）；`sharedLobby` 的 7 条取各游戏现有值里该统一的那个（见文件末尾的注释）：

```ts
import type { ErrorCode } from "@tpg/protocol";
import type { Lang } from "./i18n";

/** 能落进 status store 的东西:线上报错,或本地通知。 */
export type StatusCode = ErrorCode | "OPPONENT_DISCONNECTED";

/** 终局遮罩的原因。目前只有一种:对手中途退出。 */
export type EndedCode = "OPPONENT_LEFT";

/**
 * 阶段 5 的共享 Lobby 组件要读的词条形状。各游戏 dict 的 lobby 必须满足它 ——
 * 组件落地之前就把形状钉住,阶段 5 的 diff 才能只有组件本身。
 */
export interface LobbyDict {
  createRoom: string;
  closeRoom: string;
  confirmClose: string;
  cancel: string;
  roomCode: string;
  codePlaceholder: string;
  join: string;
  /**
   * 等房时那句话。四个游戏说的不是一件事(bw 让玩家把房间码发给朋友,
   * a2f/tp 只是报状态),所以这条不给共享默认值,由各游戏自己提供。
   */
  waitingOpponent: string;
}

/** 这 8 条对应 @tpg/protocol 的 7 个 ErrorCode 加一个本地通知,四个游戏逐字相同。 */
export const sharedStatus: Record<Lang, Record<StatusCode, string>> = {
  en: {
    OPPONENT_DISCONNECTED: "Opponent disconnected, waiting to reconnect…",
    ALREADY_IN_ROOM: "You are already in a room",
    INVALID_REQUEST: "Invalid request",
    ROOM_NOT_FOUND: "Room not found",
    ROOM_FULL: "Room is full",
    INVALID_SESSION: "Invalid session",
    INVALID_MOVE: "That move is not allowed",
    OPPONENT_GONE: "Your opponent left, so a rematch is not possible",
  },
  zh: {
    OPPONENT_DISCONNECTED: "对手掉线，等待重连…",
    ALREADY_IN_ROOM: "已在房间中",
    INVALID_REQUEST: "请求无效",
    ROOM_NOT_FOUND: "房间不存在",
    ROOM_FULL: "房间已满",
    INVALID_SESSION: "会话无效",
    INVALID_MOVE: "该操作不合法",
    OPPONENT_GONE: "对手已离开，无法再来一局",
  },
};

/**
 * 大厅词条里该统一的 7 条。取值依据(四个游戏现状的多数,或唯一一份):
 * - createRoom / closeRoom / roomCode:三家写 "Create Room" / "Close Room" /
 *   "房间码",tp 写 "Create room" / "Dissolve room",fm 的中文写 "房间号" ——
 *   都是随手打出来的分歧,归到多数那份。
 * - confirmClose:只有 fm 有(它是唯一做了两步确认的),用它的。
 * - cancel:四家都是 "Cancel" / "取消"。
 * - codePlaceholder:三家是 "Room code" / "房间码",bw 是 "Enter room code" /
 *   "输入房间码"。取短的 —— 阶段 5 的输入框和 Join 按钮同排,窄屏下长文案会挤;
 *   bw 那个输入框是整宽的,换短的不会出问题。
 */
export const sharedLobby: Record<Lang, Omit<LobbyDict, "waitingOpponent">> = {
  en: {
    createRoom: "Create Room",
    closeRoom: "Close Room",
    confirmClose: "Confirm Close",
    cancel: "Cancel",
    roomCode: "Room Code",
    codePlaceholder: "Room code",
    join: "Join",
  },
  zh: {
    createRoom: "创建房间",
    closeRoom: "解散房间",
    confirmClose: "确认解散",
    cancel: "取消",
    roomCode: "房间码",
    codePlaceholder: "房间码",
    join: "加入",
  },
};
```

- [ ] **Step 4: 加进 index.ts**

```ts
export { assertDictParity, dictParityIssues } from "./testing";
export type { ParityOptions } from "./testing";
export { createI18n, resolveLang } from "./i18n";
export type { I18n, I18nOptions, Lang } from "./i18n";
export { sharedLobby, sharedStatus } from "./dict";
export type { EndedCode, LobbyDict, StatusCode } from "./dict";
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test --workspace @tpg/client`
Expected: PASS，`Tests 18 passed (18)`（9 + 6 + 3）。

- [ ] **Step 6: typecheck + commit**

```bash
npm run typecheck --workspace @tpg/client
npx prettier --write platform/client
git add platform/client
git commit -m "feat(platform): add the shared status and lobby copy"
```

---

### Task 4: createRoomSession

**Files:**
- Create: `platform/client/src/roomSession.ts`
- Create: `platform/client/test/roomSession.test.ts`
- Modify: `platform/client/src/index.ts`

**Interfaces:**
- Consumes: `StatusCode`、`EndedCode`（Task 3）、`ErrorMsg`、`RoomAccepted`（`@tpg/protocol`）
- Produces:
  ```ts
  type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
  interface RoomSessionOptions<V> {
    storagePrefix: string;
    onView?: (view: V) => void;
    onLeave?: () => void;
    socket?: Socket;
    storage?: StorageLike;
  }
  interface RoomSession<V> {
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
  function createRoomSession<V extends { phase: string }>(
    opts: RoomSessionOptions<V>,
  ): RoomSession<V>;
  ```
  Task 5–8 四个游戏的 `socket.ts` 全靠它。

- [ ] **Step 1: 写失败的测试**

`platform/client/test/roomSession.test.ts`。20 条，覆盖 rejoin 静默失败的丢弃、storage key 的拼法、以及第 4 处 spec 修正定下的 `status` 规则：

```ts
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

function make(opts: Partial<Parameters<typeof createRoomSession<TestView>>[0]> = {}) {
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test --workspace @tpg/client`
Expected: FAIL —— `Failed to resolve import "../src/roomSession"`。

- [ ] **Step 3: 写实现**

`platform/client/src/roomSession.ts`：

```ts
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
    // 例外 —— 它说的是对手,要留到 opponent_reconnected;flip-math 的计时器
    // 每次推进都发视图,一起清掉的话对手一掉线横幅立刻消失。
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
```

- [ ] **Step 4: 加进 index.ts**

```ts
export { assertDictParity, dictParityIssues } from "./testing";
export type { ParityOptions } from "./testing";
export { createI18n, resolveLang } from "./i18n";
export type { I18n, I18nOptions, Lang } from "./i18n";
export { sharedLobby, sharedStatus } from "./dict";
export type { EndedCode, LobbyDict, StatusCode } from "./dict";
export { createRoomSession } from "./roomSession";
export type { RoomSession, RoomSessionOptions, StorageLike } from "./roomSession";
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test --workspace @tpg/client`
Expected: PASS，`Tests 38 passed (38)`（9 + 6 + 3 + 20）。

- [ ] **Step 6: typecheck + commit**

```bash
npm run typecheck --workspace @tpg/client
npx prettier --write platform/client
git add platform/client
git commit -m "feat(platform): add createRoomSession"
```

---

### Task 5: black-and-white 迁移

四个游戏里 bw 最复杂（唯一有额外 socket 事件 `game_over` 和额外 store `review` 的），先做它，能把框架的接缝全走一遍。

**Files:**
- Rewrite: `black-and-white/packages/client/src/socket.ts`（96 → 22 行）
- Rewrite: `black-and-white/packages/client/src/i18n.ts`（178 → 约 140 行）
- Rewrite: `black-and-white/packages/client/test/i18n.test.ts`（58 → 10 行）
- Modify: `black-and-white/packages/client/src/lib/Lobby.svelte:35`（`sharePrompt` → `waitingOpponent`）
- Modify: `black-and-white/packages/client/package.json`（加 `@tpg/client` 依赖）

**Interfaces:**
- Consumes: `createRoomSession`、`createI18n`、`sharedLobby`、`sharedStatus`、`LobbyDict`、`EndedCode`、`Lang`、`assertDictParity`（Task 1–4）
- Produces: `src/socket.ts` 继续导出 `view` / `review` / `roomCode` / `status` / `ended` / `createRoom` / `joinRoom` / `playCard` / `rematch` / `tryRejoin` / `leaveRoom`；`src/i18n.ts` 继续导出 `dict` / `lang` / `t` / `toggleLang` / `Dict`。名字一个都不变,所以 6 个组件不用动。

- [ ] **Step 1: 加依赖**

在 `black-and-white/packages/client/package.json` 的 `dependencies` 里,`@bw/shared` 后面加一行：

```json
  "dependencies": {
    "@bw/shared": "*",
    "@tpg/client": "*",
    "socket.io-client": "^4.7.0"
  },
```

- [ ] **Step 2: 重写 socket.ts**

整份替换 `black-and-white/packages/client/src/socket.ts`：

```ts
import { writable } from "svelte/store";
import { createRoomSession } from "@tpg/client";
import type { ClientView, GameReview } from "@bw/shared";

export const review = writable<GameReview | null>(null);

const session = createRoomSession<ClientView>({
  storagePrefix: "bw",
  // 新的 playing 视图说明开了新局(rematch),把终局复盘收掉,
  // 双方一起掉回牌桌。ended 由框架清(phase !== "finished")。
  onView: (v) => {
    if (v.phase === "playing") review.set(null);
  },
  onLeave: () => review.set(null),
});

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
export const rematch = () => session.emit("rematch");

session.socket.on("game_over", (r: GameReview) => review.set(r));
```

- [ ] **Step 3: 重写 i18n.ts 的头尾**

三处改动，中间的 `table` / `review` / `chip` / `backToLobby` 词条原封不动。

**头部**（替换第 1–13 行）：

```ts
import { createI18n, sharedLobby, sharedStatus } from "@tpg/client";
import type { EndedCode, Lang, LobbyDict } from "@tpg/client";

// 英文那份是词典形状的源头;zh 按它的类型声明,漏一条翻译就是类型错误,
// 不是运行时的窟窿。
const en = {
```

`STORAGE_KEY` 那个常量不再单独留一行,直接写在最后的 `createI18n` 调用里。

**`lobby` 块**（原第 17–24 行）换成：

```ts
  lobby: {
    ...sharedLobby.en,
    waitingOpponent: "Send it to a friend and wait for them to join…",
  } satisfies LobbyDict,
```

原来的 `sharePrompt` 就是这一位,改名成 `waitingOpponent`(`LobbyDict` 要求的名字),文案保留 —— bw 这句是让玩家去分享房间码,和另三个游戏那句"等人加入"不是一件事。

**`status` / `ended` 块**（原第 61–73 行）换成：

```ts
  status: sharedStatus.en,
  ended: {
    OPPONENT_LEFT: "Your opponent left the game. You win 🎉",
  } satisfies Record<EndedCode, string>,
};
```

**zh 那份的对应三块**：

```ts
  lobby: {
    ...sharedLobby.zh,
    waitingOpponent: "发给朋友，等待对手加入…",
  },
```

```ts
  status: sharedStatus.zh,
  ended: {
    OPPONENT_LEFT: "对手已退出本局，你获胜 🎉",
  },
};
```

**尾部**（替换原第 140–178 行,即 `export const dict` 之后的全部引擎代码）：

```ts
export const dict: Record<Lang, Dict> = { en, zh };

export const { lang, t, toggleLang } = createI18n({
  storageKey: "bw_lang",
  dict,
});
```

原来导出的 `StatusCode` / `EndedCode` / `resolveLang` 不用再导 —— grep 过,唯一的消费者是 `socket.ts`(现在不 import 了)和 `test/i18n.test.ts`(下一步重写)。

- [ ] **Step 4: 改 Lobby.svelte 里那一处 key**

```bash
perl -pi -e 's/\$t\.lobby\.sharePrompt/\$t.lobby.waitingOpponent/' black-and-white/packages/client/src/lib/Lobby.svelte
grep -n "waitingOpponent\|sharePrompt" black-and-white/packages/client/src/lib/Lobby.svelte
```

Expected: 一行 `waitingOpponent`，没有 `sharePrompt`。

- [ ] **Step 5: 重写 i18n.test.ts**

整份替换 `black-and-white/packages/client/test/i18n.test.ts`：

```ts
import { describe, it } from "vitest";
import { assertDictParity } from "@tpg/client";
import { dict } from "../src/i18n";

describe("dictionary", () => {
  it("zh 和 en 形状一致且没有漏翻", () => {
    assertDictParity(dict.en, dict.zh);
  });
});
```

`resolveLang` 那 4 条不在这里了 —— 它现在只有一份实现,在 `platform/client/test/i18n.test.ts` 里测一次。

- [ ] **Step 6: 装依赖并跑测试**

```bash
npm install
npm test --workspace @bw/client
```

Expected: `Tests 1 passed (1)`。

若 parity 报错，按它给出的路径改（最可能是 `lobby.*` 某个 key 中英都还留着英文）。

- [ ] **Step 7: svelte-check**

Run: `npm run check --workspace @bw/client`
Expected: `svelte-check found 0 errors and 0 warnings`。

- [ ] **Step 8: 服务器集成测试没被碰**

抽取只动 client，server 那 19 条必须原样通过：

```bash
npm test --workspace @bw/server
git diff --stat black-and-white/packages/server
```

Expected: `Tests 19 passed (19)`；diff 为空。

- [ ] **Step 9: 浏览器里真打一局**

svelte-check 抓不到运行时的接线错误，这一步是唯一的判据。

```bash
npx vite --port 5173 --strictPort --host 127.0.0.1
```

配合服务器：另起一个 `npm run dev --workspace @bw/server`（或 `npx tsx black-and-white/packages/server/src/index.ts`）。

两个玩家不能用同源的两个标签页（共享 localStorage 里的 session token），也不能用 `127.0.0.1` 对 `localhost` 换主机名（导航会被拒）。第二个玩家用 node 端的 `socket.io-client` 顶：

```js
// /tmp/p2-bw.mjs —— 注意 socket.io-client 要从仓库根的 node_modules 取,
// 各游戏目录下已经没有自己的 node_modules 了。
const { io } = await import("/Users/chengminyu/Desktop/TwoPlayerGames/node_modules/socket.io-client/build/esm/index.js");
const s = io("http://localhost:3001");
s.on("connect", () => s.emit("join_room", { roomCode: process.argv[2] }));
s.on("view_update", (v) => {
  console.log("p2 view:", v.phase, JSON.stringify(v).slice(0, 200));
  if (v.phase === "playing" && v.myHand?.length) {
    setTimeout(() => s.emit("play_card", { card: v.myHand[0] }), 300);
  }
});
s.on("game_over", (r) => console.log("p2 game_over:", JSON.stringify(r).slice(0, 300)));
s.on("error_msg", (e) => console.log("p2 error:", e.code));
```

要确认的六件事：
1. 大厅能建房、房间码显示出来
2. 房间码下面那句提示还是「发给朋友，等待对手加入…」（第 4 步改名没改文案）
3. p2 加入后双方进牌桌，出一张牌能结算出比分
4. 刷新页面能回到局里（证明 `bw_token` / `bw_room` 两个 key 没变）
5. 点语言开关切到英文，刷新后还是英文（证明 `bw_lang` 没变）
6. 控制台没有 error

- [ ] **Step 10: format + commit**

```bash
npx prettier --write black-and-white/packages/client
npm run format:check
git add black-and-white package-lock.json
git commit -m "refactor(black-and-white): run the client on @tpg/client"
```

---

### Task 6: flip-math 迁移

fm 的特别之处：状态由计时器推进，`view_update` 里有个回合结果 toast 要在 `onView` 里重建；而它也是 Task 4 那条 `status` 规则唯一能在浏览器里看出来的游戏。

**Files:**
- Rewrite: `flip-math/packages/client/src/socket.ts`（113 → 46 行）
- Rewrite: `flip-math/packages/client/src/i18n.ts`（174 → 约 140 行）
- Rewrite: `flip-math/packages/client/test/i18n.test.ts`（58 → 10 行）
- Modify: `flip-math/packages/client/package.json`

**Interfaces:**
- Consumes: 同 Task 5
- Produces: `src/socket.ts` 继续导出 `view` / `roomCode` / `status` / `ended` / `roundResult` / `createRoom` / `joinRoom` / `buzz` / `ready` / `selectCell` / `rematch` / `tryRejoin` / `leaveRoom`

- [ ] **Step 1: 加依赖**

```json
  "dependencies": {
    "@fm/shared": "*",
    "@tpg/client": "*",
    "socket.io-client": "^4.7.0"
  },
```

- [ ] **Step 2: 重写 socket.ts**

整份替换 `flip-math/packages/client/src/socket.ts`：

```ts
import { writable } from "svelte/store";
import { createRoomSession } from "@tpg/client";
import { UI } from "@fm/shared";
import type { ClientView } from "@fm/shared";
import { backText } from "./lib/cellFace";

// 回合结果小提示(toast),有人答对时由 onView 置上,UI.resultPopupMs 后自动清空。
// 存结构化数据而非成品文案:玩家中途切语言,提示要跟着变。
export const roundResult = writable<{
  by: "me" | "opp";
  equation: string;
} | null>(null);

let prevPhase: string | null = null;
let resultTimer: ReturnType<typeof setTimeout> | undefined;

const session = createRoomSession<ClientView>({
  storagePrefix: "fm",
  onView: (v) => {
    // 回合结束(有人答对)→ 弹自动消失的结果提示。只在刚进入 resolve
    // 且答对时触发一次。
    if (
      v.phase === "resolve" &&
      prevPhase !== "resolve" &&
      v.lastResolve?.correct
    ) {
      const [ca, cop, cb] = v.lastResolve.cells.map((i) => v.board[i]);
      const equation =
        ca && cop && cb
          ? `${backText(ca)} ${backText(cop)} ${backText(cb)} = ${v.target}`
          : "";
      roundResult.set({ by: v.active === "me" ? "me" : "opp", equation });
      clearTimeout(resultTimer);
      resultTimer = setTimeout(() => roundResult.set(null), UI.resultPopupMs);
    }
    prevPhase = v.phase;
  },
  onLeave: () => {
    roundResult.set(null);
    clearTimeout(resultTimer);
  },
});

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

export const buzz = () => session.emit("buzz");
export const ready = () => session.emit("ready");
export const selectCell = (index: number) =>
  session.emit("select_cell", { index });
export const rematch = () => session.emit("rematch");
```

- [ ] **Step 3: 重写 i18n.ts 的头尾**

**头部**（替换第 1–13 行）：

```ts
import { createI18n, sharedLobby, sharedStatus } from "@tpg/client";
import type { EndedCode, Lang, LobbyDict } from "@tpg/client";

// 英文那份是词典形状的源头;zh 按它的类型声明,漏一条翻译就是类型错误,
// 不是运行时的窟窿。
const en = {
```

**`lobby` 块**（原第 16–25 行）换成：

```ts
  lobby: {
    ...sharedLobby.en,
    waitingOpponent: "Waiting for an opponent…",
  } satisfies LobbyDict,
```

fm 原来就有 `LobbyDict` 那 8 个 key 全套（它是唯一做了两步确认的），所以这一步只是把 7 条交给共享值。注意它原来的中文 `roomCode` 写的是「房间号」，换成共享的「房间码」—— 另三个游戏都是「房间码」。

**`status` / `ended` 块**（原第 59–71 行）换成：

```ts
  status: sharedStatus.en,
  ended: {
    OPPONENT_LEFT: "Your opponent left the game. You win 🎉",
  } satisfies Record<EndedCode, string>,
};
```

**zh 那份**：

```ts
  lobby: {
    ...sharedLobby.zh,
    waitingOpponent: "等待对手加入…",
  },
```

```ts
  status: sharedStatus.zh,
  ended: {
    OPPONENT_LEFT: "对手已退出本局，你获胜 🎉",
  },
};
```

**尾部**（替换 `export const dict` 之后的全部引擎代码）：

```ts
export const dict: Record<Lang, Dict> = { en, zh };

export const { lang, t, toggleLang } = createI18n({
  storageKey: "fm_lang",
  dict,
});
```

- [ ] **Step 4: 重写 i18n.test.ts**

```ts
import { describe, it } from "vitest";
import { assertDictParity } from "@tpg/client";
import { dict } from "../src/i18n";

describe("dictionary", () => {
  it("zh 和 en 形状一致且没有漏翻", () => {
    assertDictParity(dict.en, dict.zh);
  });
});
```

- [ ] **Step 5: 装依赖并跑测试**

```bash
npm install
npm test --workspace @fm/client
npm test --workspace @fm/server
```

Expected: client `Tests 1 passed (1)`；server `Tests 9 passed (9)`。

fm 那 9 条 server 测试是计时驱动的，它们能证明服务器那半没被动过。

- [ ] **Step 6: svelte-check**

Run: `npm run check --workspace @fm/client`
Expected: `0 errors and 0 warnings`。

- [ ] **Step 7: 浏览器验收 —— 顺带验 status 规则**

fm 是四个游戏里唯一能在浏览器里看出 Task 4 那条 `status` 规则的：它的状态由计时器推进，每次转移都发视图。

```bash
npx vite --port 5174 --strictPort --host 127.0.0.1
```

注意：**不要在 dev server 跑着的时候改配置文件**。阶段 1 踩过 —— 那会让 vite-plugin-svelte 重启 vite，`--strictPort` 下新进程和旧监听抢同一个端口，直接 exit 1。真撞上了就 `lsof -ti:5174 | xargs kill` 再起。

要确认的五件事：
1. 建房、p2（node 脚本）加入、双方点准备、preview 倒计时开始
2. 抢答、点 3 格组算式，答对时顶部弹出结果提示并自动消失
3. **把 p2 的 node 进程 kill 掉** → 出现「对手掉线，等待重连…」横幅 → **横幅要一直挂着，不能被后续的计时器视图冲掉**（这条就是 Task 4 第 4 处修正要防的回归）
4. 刷新页面能回到局里（`fm_token` / `fm_room` 没变）
5. 控制台没有 error

- [ ] **Step 8: format + commit**

```bash
npx prettier --write flip-math/packages/client
npm run format:check
git add flip-math package-lock.json
git commit -m "refactor(flip-math): run the client on @tpg/client"
```

---

### Task 7: add-to-fifty 迁移

四个里最简单的：没有额外 store，没有额外 socket 事件，`onView` / `onLeave` 都不用传。

**Files:**
- Rewrite: `add-to-fifty/packages/client/src/socket.ts`（86 → 18 行）
- Rewrite: `add-to-fifty/packages/client/src/i18n.ts`（164 → 约 135 行）
- Rewrite: `add-to-fifty/packages/client/test/i18n.test.ts`（61 → 13 行）
- Modify: `add-to-fifty/packages/client/package.json`

**Interfaces:**
- Consumes: 同 Task 5
- Produces: `src/socket.ts` 继续导出 `view` / `roomCode` / `status` / `ended` / `createRoom` / `joinRoom` / `playCard` / `rematch` / `tryRejoin` / `leaveRoom`

- [ ] **Step 1: 加依赖**

```json
  "dependencies": {
    "@add-to-fifty/shared": "*",
    "@tpg/client": "*",
    "socket.io-client": "^4.7.0"
  },
```

- [ ] **Step 2: 重写 socket.ts**

整份替换 `add-to-fifty/packages/client/src/socket.ts`：

```ts
import { createRoomSession } from "@tpg/client";
import type { ClientView } from "@add-to-fifty/shared";

const session = createRoomSession<ClientView>({ storagePrefix: "add2fifty" });

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

export const playCard = (cardId: string, kingDelta?: number) =>
  session.emit("play_card", { cardId, kingDelta });
export const rematch = () => session.emit("rematch");
```

原来的 `ended` 清理（`if (next.phase !== "finished") ended.set(null)`）现在由框架做，逐字相同的条件。

- [ ] **Step 3: 重写 i18n.ts 的头尾**

**头部**（替换第 1–13 行）：

```ts
import { createI18n, sharedLobby, sharedStatus } from "@tpg/client";
import type { EndedCode, Lang, LobbyDict } from "@tpg/client";

// 英文那份是词典形状的源头;zh 按它的类型声明,漏一条翻译就是类型错误,
// 不是运行时的窟窿。
const en = {
```

**`lobby` 块**（原第 18–25 行）换成：

```ts
  lobby: {
    ...sharedLobby.en,
    waitingOpponent: "Waiting for a second player",
  } satisfies LobbyDict,
```

a2f 原来没有 `confirmClose` 和 `cancel`（它的解散是一步到位的），现在从共享词条拿到了。阶段 5 的共享 Lobby 会把两步确认铺到四个游戏，这两条到那时才被用上。

**`status` / `ended` 块**换成：

```ts
  status: sharedStatus.en,
  ended: {
    OPPONENT_LEFT: "Your opponent left the game. You win",
  } satisfies Record<EndedCode, string>,
};
```

a2f 这句不带 🎉，是它整份词典的一贯写法（`gameOver.win` 也是「你赢了」不带 emoji），保留。

**zh 那份**：

```ts
  lobby: {
    ...sharedLobby.zh,
    waitingOpponent: "等待第二位玩家加入",
  },
```

```ts
  status: sharedStatus.zh,
  ended: {
    OPPONENT_LEFT: "对手已退出本局，你获胜",
  },
};
```

**尾部**：

```ts
export const dict: Record<Lang, Dict> = { en, zh };

export const { lang, t, toggleLang } = createI18n({
  storageKey: "add2fifty_lang",
  dict,
});
```

- [ ] **Step 4: 重写 i18n.test.ts**

a2f 的 `SHARED_BY_DESIGN` 有两条，要带上：

```ts
import { describe, it } from "vitest";
import { assertDictParity } from "@tpg/client";
import { dict } from "../src/i18n";

describe("dictionary", () => {
  it("zh 和 en 形状一致且没有漏翻", () => {
    assertDictParity(dict.en, dict.zh, {
      sharedByDesign: [
        "title", // 已上线的英文产品名,中文界面里也保持英文
        "table.handLegend", // 牌面缩写,中英只差结尾那个词
      ],
    });
  });
});
```

- [ ] **Step 5: 装依赖并跑测试**

```bash
npm install
npm test --workspace @add-to-fifty/client
npm test --workspace @add-to-fifty/server
```

Expected: client `Tests 1 passed (1)`；server `Tests 6 passed (6)`。

- [ ] **Step 6: svelte-check**

Run: `npm run check --workspace @add-to-fifty/client`
Expected: `0 errors and 0 warnings`。

- [ ] **Step 7: 浏览器验收**

```bash
npx vite --port 5175 --strictPort --host 127.0.0.1
```

要确认的四件事：
1. 建房、p2 加入、双方进牌桌
2. 出一张牌：累积分往上走，手牌补齐
3. 刷新页面能回到局里（`add2fifty_token` / `add2fifty_room` 没变）
4. 控制台没有 error

顺带看一眼房间码输入框的 placeholder ——`sharedLobby` 的 `codePlaceholder` 和 a2f 原值相同（"Room code" / "房间码"），这一栏应当看不出变化。

- [ ] **Step 8: format + commit**

```bash
npx prettier --write add-to-fifty/packages/client
npm run format:check
git add add-to-fifty package-lock.json
git commit -m "refactor(add-to-fifty): run the client on @tpg/client"
```

---

### Task 8: texas-poker 迁移

tp 的大厅词条用的是另一套名字（`create` / `dissolve` / `waiting`），要改名对上 `LobbyDict`；它的 `lobby.subtitle` 还得挪到顶层（`satisfies` 不让字面量带额外 key，已用 tsc 验证）。所以它是四个里唯一要动组件的。

**Files:**
- Rewrite: `texas-poker/packages/client/src/socket.ts`（102 → 26 行）
- Rewrite: `texas-poker/packages/client/src/i18n.ts`（274 → 约 245 行）
- Rewrite: `texas-poker/packages/client/test/i18n.test.ts`（60 → 12 行）
- Modify: `texas-poker/packages/client/src/lib/Lobby.svelte`（5 处词条引用）
- Modify: `texas-poker/packages/client/package.json`

**Interfaces:**
- Consumes: 同 Task 5
- Produces: `src/socket.ts` 继续导出 `view` / `roomCode` / `status` / `ended` / `createRoom` / `joinRoom` / `act` / `nextHand` / `restartMatch` / `updateSettings` / `tryRejoin` / `leaveRoom`

- [ ] **Step 1: 加依赖**

```json
  "dependencies": {
    "@texas-poker/shared": "*",
    "@tpg/client": "*",
    "socket.io-client": "^4.7.0"
  },
```

- [ ] **Step 2: 重写 socket.ts**

整份替换 `texas-poker/packages/client/src/socket.ts`：

```ts
import { createRoomSession } from "@tpg/client";
import type {
  ClientView,
  GameConfig,
  PlayerAction,
} from "@texas-poker/shared";

const session = createRoomSession<ClientView>({ storagePrefix: "texas_poker" });

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

export const act = (action: PlayerAction) =>
  session.emit("poker_action", action);
export const nextHand = () => session.emit("next_hand");
export const restartMatch = () => session.emit("restart_match");
export const updateSettings = (
  settings: Partial<Pick<GameConfig, "enforceMinRaise" | "startingChips">>,
) => session.emit("update_settings", settings);
```

tp 原来在 `view_update` 里那句无条件的 `status.set(null)` 没了 —— 框架换成了只清操作报错、留住 `OPPONENT_DISCONNECTED` 的版本（本计划开头第 4 处修正）。

- [ ] **Step 3: 重写 i18n.ts 的头尾**

**头部**（替换第 1–13 行,注意 tp 多一个 `GuideKey`，还要留着 `HandCategory` 的 import）：

```ts
import { createI18n, sharedLobby, sharedStatus } from "@tpg/client";
import type { EndedCode, Lang, LobbyDict } from "@tpg/client";
import type { HandCategory } from "@texas-poker/shared";

export type GuideKey = HandCategory | "royal-flush";

// 英文那份是词典形状的源头;zh 按它的类型声明,漏一条翻译就是类型错误,
// 不是运行时的窟窿。
const en = {
```

读一遍原文件第 1–13 行再动手 —— tp 的头部比另三个多两行（`HandCategory` 的 import 和 `GuideKey`），别把它们删掉。

**`en.lobby` 块**（原第 19–26 行）换成两部分：`subtitle` 升到顶层，其余进 `lobby`：

```ts
  title: "Texas Poker",
  subtitle: "Two-player heads-up poker",
  lobby: {
    ...sharedLobby.en,
    waitingOpponent: "Waiting for player two",
  } satisfies LobbyDict,
```

三个 key 在这一步改了名：`create` → `createRoom`、`dissolve` → `closeRoom`、`waiting` → `waitingOpponent`（都是 `LobbyDict` 要求的名字）。`subtitle` 必须离开 `lobby`，因为 `satisfies LobbyDict` 会对字面量里显式写出的额外 key 报 TS2353。bw 本来就把副标题放顶层，tp 跟着它。

**`status` / `ended` 块**（原第 112–124 行）换成：

```ts
  status: sharedStatus.en,
  ended: {
    OPPONENT_LEFT: "Your opponent left the match",
  } satisfies Record<EndedCode, string>,
};
```

tp 这句和另三个不同，保留：德州扑克里对手中途退出不等于你赢，筹码才算。

**zh 那份**：

```ts
  // Shipped product name; it was already English-only in the Chinese UI.
  title: "Texas Poker",
  subtitle: "双人 heads-up 德州扑克",
  lobby: {
    ...sharedLobby.zh,
    waitingOpponent: "等待第二位玩家加入",
  },
```

```ts
  status: sharedStatus.zh,
  ended: {
    OPPONENT_LEFT: "对手已退出牌局",
  },
};
```

**尾部**（替换 `export const dict` 之后的全部引擎代码）：

```ts
export const dict: Record<Lang, Dict> = { en, zh };

export const { lang, t, toggleLang } = createI18n({
  storageKey: "texas_poker_lang",
  dict,
});
```

- [ ] **Step 4: 改 Lobby.svelte 的 5 处引用**

`texas-poker/packages/client/src/lib/Lobby.svelte` 里 `$: copy = $t.lobby` 这个别名留着，改的是键名：

| 第 | 现在 | 改成 |
| --- | --- | --- |
| 20 | `{copy.subtitle}` | `{$t.subtitle}` |
| 29 | `{copy.waiting}` | `{copy.waitingOpponent}` |
| 31 | `{copy.dissolve}` | `{copy.closeRoom}` |
| 33 | `{copy.create}` | `{copy.createRoom}` |
| 39 | `placeholder={copy.roomCode}` | `placeholder={copy.codePlaceholder}` |

```bash
f=texas-poker/packages/client/src/lib/Lobby.svelte
perl -pi -e 's/\{copy\.subtitle\}/{\$t.subtitle}/; s/\{copy\.waiting\}/{copy.waitingOpponent}/; s/\{copy\.dissolve\}/{copy.closeRoom}/; s/\{copy\.create\}/{copy.createRoom}/; s/placeholder=\{copy\.roomCode\}/placeholder={copy.codePlaceholder}/' "$f"
grep -n "copy\.\|\$t\." "$f"
```

Expected: `$t.title`、`$t.subtitle`、`copy.roomCode`、`copy.waitingOpponent`、`copy.closeRoom`、`copy.createRoom`、`copy.codePlaceholder`、`copy.join`、`$t.status[$status]`。没有 `copy.waiting`（不带 Opponent 的）、`copy.dissolve`、`copy.create`、`copy.subtitle`。

第 39 行那处是修个小毛病：输入框原来拿 `roomCode`（「房间码」，本来是上面那块的标题）当 placeholder。`LobbyDict` 有专门的 `codePlaceholder`，用它。

perl 的正则里 `|` 别当分隔符 —— 阶段 1 踩过一次，`s|...|...|` 碰上内容里的 `on:click|self` 会截断，把改动落到别的地方。上面用的是默认的 `/`。

- [ ] **Step 5: 重写 i18n.test.ts**

```ts
import { describe, it } from "vitest";
import { assertDictParity } from "@tpg/client";
import { dict } from "../src/i18n";

describe("dictionary", () => {
  it("zh 和 en 形状一致且没有漏翻", () => {
    assertDictParity(dict.en, dict.zh, {
      // 已上线的英文产品名,中文界面里也保持英文
      sharedByDesign: ["title"],
    });
  });
});
```

- [ ] **Step 6: 装依赖并跑测试**

```bash
npm install
npm test --workspace @texas-poker/client
npm test --workspace @texas-poker/server
```

Expected: client `Tests 1 passed (1)`；server `Tests 8 passed (8)`。

- [ ] **Step 7: svelte-check**

Run: `npm run check --workspace @texas-poker/client`
Expected: `0 errors and 0 warnings`。

这一步是 Step 4 那 5 处改名的判据：漏改一处，`copy.waiting` 之类就是 `Property 'waiting' does not exist`。

- [ ] **Step 8: 浏览器验收**

```bash
npx vite --port 5176 --strictPort --host 127.0.0.1
```

要确认的六件事：
1. 大厅标题下面的副标题还在（`subtitle` 从 `lobby` 挪到顶层之后）
2. 「创建房间」按钮文案对（`create` → `createRoom` 改名之后）
3. 房间码输入框的 placeholder 现在是「房间码」而不是标题那个
4. p2 加入、跟注把底池推上去
5. 刷新页面能回到牌局（`texas_poker_token` / `texas_poker_room` 没变）
6. 控制台没有 error

- [ ] **Step 9: format + commit**

```bash
npx prettier --write texas-poker/packages/client
npm run format:check
git add texas-poker package-lock.json
git commit -m "refactor(texas-poker): run the client on @tpg/client"
```

---

### Task 9: 阶段验收与合并

**Files:**
- Modify: `docs/superpowers/plans/2026-09-16-platform-client-phase-4.md`（勾完 checkbox）
- Modify: `docs/superpowers/specs/2026-09-16-platform-extraction-design.md`（把开头那五处修正写回 spec 的 4.1–4.4）

- [ ] **Step 1: 全量测试**

Run: `npm test --workspaces --if-present`
Expected: 214 个全过。分布：

| 包 | 个数 |
| --- | --- |
| `@tpg/protocol` | 5 |
| `@tpg/client` | 38 |
| `@tpg/server` | 40 |
| `@bw/client` / `server` / `shared` | 1 / 19 / 20 |
| `@fm/client` / `server` / `shared` | 1 / 9 / 37 |
| `@add-to-fifty/client` / `server` / `shared` | 1 / 6 / 11 |
| `@texas-poker/client` / `server` / `shared` | 1 / 8 / 17 |

对照阶段 3 收尾的 196：client 的 i18n 测试从 6×4=24 降到 1×4=4（−20），`@tpg/client` 新增 38。196 − 20 + 38 = 214。

数不对就先定位是哪个包，别急着改数字 —— 这张表是算出来的，对不上说明有测试没跑或者被漏掉了。

- [ ] **Step 2: 四个 svelte-check**

```bash
for w in @bw/client @fm/client @add-to-fifty/client @texas-poker/client; do
  echo "=== $w"; npm run check --workspace $w 2>&1 | tail -2
done
```

Expected: 四个都 `0 errors and 0 warnings`。

- [ ] **Step 3: 三个 platform 包 typecheck**

```bash
for w in @tpg/protocol @tpg/client @tpg/server; do
  echo "=== $w"; npm run typecheck --workspace $w && echo OK
done
```

Expected: 三个都 `OK`。

- [ ] **Step 4: 四个镜像完整构建**

```bash
for g in black-and-white:bw flip-math:flip add-to-fifty:a2f texas-poker:tp; do
  d=${g%%:*}; t=${g##*:}
  docker build --target server -f "$d/Dockerfile" -t "tpg-$t-server" . && echo "$d server image OK"
  docker build --target web -f "$d/Dockerfile" -t "tpg-$t-web" . && echo "$d web image OK"
done
```

Expected: 八行 `OK`。web 阶段会跑 `vite build`，所以它同时在验 `@tpg/client` 的 TS 能被生产构建编译 —— 这是 svelte-check 之外的第二道类型关。

- [ ] **Step 5: 容器里起一遍并握手**

```bash
for g in black-and-white flip-math add-to-fifty texas-poker; do
  echo "=== $g"
  ( cd "$g" && docker compose up -d && sleep 3 && docker compose logs --tail 5 | grep "server on" )
done
```

Expected: 四行 `... server on :3001`。

再验 socket.io 能穿过 Caddy（四个 compose 的 web 端口各自看 `docker-compose.yml`）：

```bash
curl -s "http://localhost:<web-port>/socket.io/?EIO=4&transport=polling" | head -c 120
```

Expected: 返回体里有 `"sid"`。

看完收掉：

```bash
for g in black-and-white flip-math add-to-fifty texas-poker; do ( cd "$g" && docker compose down ); done
```

- [ ] **Step 6: 把五处修正写回 spec**

Task 1–8 是按本计划开头那五处修正做的，spec 的 4.1–4.4 还是旧说法。改 spec：

1. 4.3 「`ended.OPPONENT_LEFT` 同样」删掉，换成三个版本的表格加 tp 语义不同的理由，并说明 `ended` 文案不进 `sharedDict`。
2. 4.3 的 `sharedDict` 代码块换成实际落地的 `sharedStatus` + `sharedLobby` 两个导出，`LobbyDict` 注明是形状契约、`waitingOpponent` 不给默认值。
3. 4.1 「顺带统一的一处行为」整节重写：tp 那句 `status.set(null)` 是 bug，框架用的是保留 `OPPONENT_DISCONNECTED` 的版本，理由是 flip-math 的计时器会发视图。
4. 4.1 的 bw 示例补上 `ended` 由框架清（`phase !== "finished"`），并写上为什么这不改 bw 的行为。
5. 4.1 的 `RoomSessionOptions` 补上 `socket` / `storage` 两个测试注入口，注明为什么不引 jsdom。

- [ ] **Step 7: 勾完 checkbox 并提交**

```bash
git add docs/superpowers
git commit -m "docs: mark phase 4 complete, correct the spec's client section"
```

- [ ] **Step 8: 合回 main**

```bash
git checkout main
git merge --no-ff platform-client -m "Merge branch 'platform-client': extract the client session layer into @tpg/client"
```

- [ ] **Step 9: merge 后在 main 上复验**

```bash
npm test --workspaces --if-present 2>&1 | grep -c "passed"
for w in @bw/client @fm/client @add-to-fifty/client @texas-poker/client; do
  npm run check --workspace $w 2>&1 | grep -c "0 errors and 0 warnings"
done
git status --short
```

Expected: 测试全过、四个 `1`、工作区干净。

**不要 `git push`。** 推送由用户自己做。

---

## 自查

写完之后按 spec 对了一遍，记录如下。

**1. spec 覆盖：** 4.1 `createRoomSession` → Task 4；「key 前缀不变」→ Task 4 Step 1 的第三条测试加四个 task 的浏览器刷新验收；「顺带统一的一处行为」→ 改成第 4 处修正，Task 4 两条测试；4.2 `createI18n` → Task 2；4.3 共享词条 → Task 3（按第 1、3 处修正调整）；4.4 `assertDictParity` → Task 1；4.5 验收 → Task 9。没有落空的小节。

**2. placeholder 扫描：** 每个代码步骤都是可以直接落盘的整段内容，没有「按需处理」「补上错误处理」之类。四份 `socket.ts`、四处 `i18n.ts` 的改动块、五个新文件、四个测试文件全是字面内容。Task 8 Step 4 的五处改名给了行号表和 perl 命令两份。

**3. 类型一致性：** `dictParityIssues` / `assertDictParity` / `ParityOptions`（Task 1 定义）在 Task 3 Step 1 和四个游戏的 `i18n.test.ts` 里同名同签名。`Lang`（Task 2）在 Task 3 的 `sharedStatus` / `sharedLobby` 和四个游戏的 `Record<Lang, Dict>` 里一致。`StatusCode` / `EndedCode` / `LobbyDict`（Task 3）在 Task 4 的 `RoomSession` 和四个游戏的 `satisfies` 里一致。`createRoomSession<V extends { phase: string }>`：四个 `ClientView` 的 `phase` 分别是 `Phase = "waiting"|"playing"|"finished"`（bw、a2f）、`"waiting"|"betting"|"finished"`（tp）和 fm 那个七项的联合，都是 `string` 的子类型，满足约束。

**4. 三处本来会出错、查过之后改掉的地方：**

- task 顺序原来是 dict → i18n，但 `sharedStatus` 的类型是 `Record<Lang, ...>`，`Lang` 在 i18n 里。反过来：i18n 是 Task 2，dict 是 Task 3。
- 原打算给 `@tpg/client` 加 `peerDependencies: { svelte }`。阶段 1 那个 npm 崩溃就在 arborist 的 `#loadPeerSet` 里，没理由去碰那条路径。改成只放 devDependencies —— 消费者自己都有 svelte，bundle 时从它们的树解析。
- 原打算让四个游戏从 `@tpg/client/testing` 这个子路径 import parity helper，那需要 package.json 的 `exports` 字段，而 `exports` 一出现 `main` 就失效，`@tpg/protocol` / `@tpg/server` 现在靠的正是 `main`。改成从包根导出，代价是 `testing.ts` 不能 import vitest（否则 vitest 会被打进生产 bundle）—— 所以它抛普通 Error 而不用 `expect`。顺带比排序数组的 diff 更好读：报的是 `zh 缺 key: lobby.cancel`，不是「两个数组不一样」。

**5. 一件想加没加的：** `dictParityIssues` 可以顺手报「`sharedByDesign` 里列了但其实中英不同字」的死条目，防清单腐烂。没加 —— 四个游戏一共 3 条，手工看得过来，YAGNI。
