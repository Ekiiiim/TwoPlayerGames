# 阶段 5：token 契约 + platform/ui 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把四个游戏各写一遍的 `Lobby`、`Button`、`LangToggle` 收成一份共享组件，四个游戏只在自己的 `theme.css` 里给一组固定的 token 赋值就长出四种样子；顺带把四份 `vite.config.ts` 和 `tsconfig.json` 收成 `platform/build` 的一个工厂加一个 base config。

**Architecture:** 新增两个 source-only 包。`platform/ui`（`@tpg/ui`）装三个 `.svelte` 组件，颜色一律写 `ui-` 前缀的语义类（`bg-ui-surface`、`text-ui-ink`…），自己不含任何具体颜色；`platform/build`（`@tpg/build`）装 vite config 工厂和 `tsconfig.base.json`。各游戏的 `theme.css` 里加一个 10 条的 `@theme` 块给 token 赋值，再加一行 `@source` 让 Tailwind 扫得到共享组件。

**Tech Stack:** Tailwind CSS v4（`@theme` / `@source`）｜ Svelte 5（legacy 模式，`runes: false`）｜ Vite 8 ｜ TypeScript 5

**Spec:** `docs/superpowers/specs/2026-09-16-platform-extraction-design.md`（阶段 5 在 5.1–5.6 节）

---

## Global Constraints

阶段 1–4 立下的约束继续生效：

- **npm ≥ 11**（本机 11.19.1）。不要给新包加 `peerDependencies`。
- **`svelte.config.js` 的 `runes: false` 不能删**，共享组件也按 legacy 模式编译（`export let` + `on:click` 转发 + `<slot />`）。
- **四个 client 的 `tsconfig.json` 保留 `verbatimModuleSyntax: true`**，类型导入一律 `import type`。
- **浏览器是客户端改动唯一的判据。** 这一阶段尤其如此：`@source` 漏了会让共享组件一条样式都没有，而**构建照常成功**（阶段 5 设计时实测过）。svelte-check 和 `vite build` 都抓不到。
- **localStorage key 前缀不变**：`bw` / `fm` / `add2fifty` / `texas_poker`，语言 key 同理。
- **四个游戏的 `packages/server/test/integration.test.ts` 不许改。**
- **不要 `git push`。**

---

## 动手前已经验过的两件事

写这个计划时拿 black-and-white 的真实构建链路验的（探针已删）：

**1. `ui-` 前缀的 token 会生成工具类。** 往 `@theme` 里写 `--color-ui-surface` / `--radius-ui-panel` / `--shadow-ui-panel`，产物 CSS 里出现：

```
.bg-ui-surface{background-color:var(--color-ui-surface)}
.text-ui-ink{color:var(--color-ui-ink)}
.rounded-ui-panel{border-radius:var(--radius-ui-panel)}
.rounded-ui-control{border-radius:var(--radius-ui-control)}
.shadow-ui-panel{--tw-shadow:0 8px 40px var(--tw-shadow-color,#00000080);...}
```

**2. `@theme` 里可以用 `var()` 引用同一份 theme 里已有的 token。** `--color-ui-ink: var(--color-felt-text)` 正常工作，`:root` 上落的就是 `--color-ui-ink:var(--color-felt-text)`。透明度修饰符也照常：`bg-ui-surface/50` 生成 `color-mix(in oklab, var(--color-ui-surface) 50%, transparent)`。

所以各游戏的契约块能直接指向自己已有的颜色，颜色改一次两边一起跟。

---

## 与 spec 的三处不一致（按这里写的做）

**1. token 名要加 `ui-` 前缀，不能用裸名。** spec 5.2 用的是 `--color-surface` / `--color-ink` / `--color-muted` / `--color-line` / `--color-accent` / `--color-danger`。裸名在 texas-poker 上会撞车：tp 的 `--color-ink` 是 `#15171a`（近黑，给奶油色牌面用的），可它的大厅面板是 `bg-felt`（#1d4d36 深绿）配 `text-felt-text`（#f3ead2 奶油）。契约要的「面板上的主文字」在 tp 是 #f3ead2，和它已有的 `--color-ink` 正好相反。照 spec 改，tp 那两处 `text-ink` 会变成奶油字写在奶油牌面上。

各游戏用到同名工具类的次数（改名会波及的面）：

| 游戏 | ink | muted | line | accent | panel | danger |
| --- | --- | --- | --- | --- | --- | --- |
| black-and-white | 0 | 0 | 0 | 0 | 0 | 1 |
| flip-math | 12 | 10 | 6 | 22 | 5 | 5 |
| add-to-fifty | 5 | 4 | 4 | 6 | 3 | 6 |
| texas-poker | 2 | 0 | 1 | 0 | 1 | 5 |

加前缀之后契约和各游戏自己的调色板永远不会互相影响：以后谁给自己加一条
`--color-line`，共享组件不会跟着变样。代价是类名长一截（`bg-ui-surface`）。

**2. 几何尺寸跟着统一，不是只统一颜色。** spec 5.6 写「其余像素不变」，做不到，因为四份 `Button` 根本是两套设计而不是一套设计的四种配色：

| | bw / fm | a2f / tp |
| --- | --- | --- |
| 底 | 无边框，`tracking-[0.5px]` | 有 `border`，`min-h-[44px]` / `[46px]` |
| primary 内距 | `px-8 py-3` | `px-4 py-2` / `px-5 py-2.5` |
| hover | `opacity-[0.88]` | `brightness-105` |
| 字号 | 继承 | `text-sm` / `text-[16px]` |

大厅面板同理：`max-w` 420/380/420/420，内距 `px-[52px] py-[48px]` / `p-8` / `p-6` / `p-6`。

把这些也做成 token，契约会从 10 条涨到 20 多条，那就不叫契约了，叫各游戏的样式表换了个地方放。按用户定的原则办——「各游戏的初始菜单的**结构**可以长得一样，但**颜色**等样式需要不一样」——内距、最小高度、字号属于结构，统一；颜色、圆角、阴影属于样式，留 token。

统一后的值：面板 `w-full max-w-[420px] p-8 gap-5`（p-8 取中，a2f/tp 从 24px 涨到 32px，bw 从 48-52px 收到 32px）；按钮 `min-h-[44px] px-5 py-2.5 text-sm font-semibold`（44px 是 iOS 的最小可点尺寸，bw/fm 从没有最小高度变成有）。

**3. `LangToggle` 用 `secondary` 而不是 `ghost`。** spec 5.4 说四个统一用 `ghost`。不行：`ghost` 是透明底，而语言开关浮在**页面**背景上，不在面板上。add-to-fifty 的页面底是深绿 `#143526`、面板却是奶油 `#f5f3ec`，所以 `--color-ui-muted` 是 `#6f6758`（深褐，配奶油面板的）——透明底加深褐字写在深绿页面上基本看不见。texas-poker 同理。`secondary` 自带 `bg-ui-surface` 底，四个游戏都读得清。bw/fm 的语言开关会从透明变成填充的一块，这是可见变化。

---

## File Structure

**新建 —— `platform/ui`（`@tpg/ui`）：**

| 文件 | 职责 | 约 |
| --- | --- | --- |
| `platform/ui/package.json` | 包声明，`main: "src/index.ts"` | 18 行 |
| `platform/ui/tsconfig.json` | 只用于 `svelte-check`，游戏侧编译 | 15 行 |
| `platform/ui/src/index.ts` | 三个组件的 barrel | 5 行 |
| `platform/ui/src/Button.svelte` | 四个 variant，全走 token | 35 行 |
| `platform/ui/src/LangToggle.svelte` | 固定右上角的语言开关 | 15 行 |
| `platform/ui/src/Lobby.svelte` | 共享大厅，含两步解散确认 | 75 行 |

**新建 —— `platform/build`（`@tpg/build`）：**

| 文件 | 职责 | 约 |
| --- | --- | --- |
| `platform/build/package.json` | 背 vite / svelte 插件 / tailwind 插件的依赖 | 20 行 |
| `platform/build/src/viteConfig.ts` | `gameViteConfig()` | 30 行 |
| `platform/build/tsconfig.base.json` | 四份 client tsconfig 的模板 | 18 行 |

**改写 —— 每个游戏：**

| 文件 | 动作 |
| --- | --- |
| `<game>/packages/client/src/theme.css` | 加 `@source` 一行 + 10 条契约 token |
| `<game>/packages/client/src/lib/Button.svelte` | **删**，改从 `@tpg/ui` 引 |
| `<game>/packages/client/src/lib/LangToggle.svelte` | **删** |
| `<game>/packages/client/src/lib/Lobby.svelte` | **删** |
| `<game>/packages/client/src/App.svelte` | 改 import；`<Lobby />` 变成带 props 的调用 |
| 其它引用 `./Button.svelte` 的组件 | 改 import 路径 |
| `<game>/packages/client/vite.config.ts` | 缩成两行 |
| `<game>/packages/client/tsconfig.json` | 改成 `extends` |
| `<game>/packages/client/package.json` | 加 `@tpg/ui` / `@tpg/build` 依赖 |

**部署：** 四个 `Dockerfile` 的 deps 阶段各加两行（`platform/ui` 和 `platform/build` 的 package.json）。理由同阶段 4：`npm ci` 要求 lockfile 和 workspace 树一致，少一个 package.json 就失败，所以必须和建包同一个 commit。

---

### Task 1: platform/ui 骨架 + token 契约

**Files:**
- Create: `platform/ui/package.json`、`platform/ui/tsconfig.json`、`platform/ui/src/index.ts`
- Modify: 四个 `<game>/packages/client/src/theme.css`
- Modify: 四个 `Dockerfile`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: 10 条 token 契约（下表），`@tpg/ui` 这个 workspace。Task 2–3 的组件只写这些名字。

- [ ] **Step 1: 建包**

```bash
mkdir -p platform/ui/src
```

`platform/ui/package.json`：

```json
{
  "name": "@tpg/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "@tpg/client": "*"
  },
  "scripts": {
    "typecheck": "svelte-check --tsconfig ./tsconfig.json"
  },
  "devDependencies": {
    "svelte": "^5.56.8",
    "svelte-check": "^4.7.4",
    "typescript": "^5.4.0"
  }
}
```

`platform/ui/tsconfig.json`：

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
    "lib": ["ESNext", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*.ts", "src/**/*.svelte"]
}
```

`platform/ui/src/index.ts`（组件还没写，先放占位注释，Task 2 填）：

```ts
// 三个共享组件的 barrel。各游戏 `import { Button } from "@tpg/ui"`。
export {};
```

- [ ] **Step 2: 四个 theme.css 加 @source**

Tailwind 默认不扫 `node_modules`，而 `@tpg/ui` 正是通过 workspace 符号链接引进来的。漏了这行，共享组件里独有的 class 一条都不生成，**而且构建成功、没有任何警告**。

四个文件的第一行 `@import "tailwindcss";` 后面各加一行：

```css
@import "tailwindcss";

/* Tailwind 默认跳过 node_modules,而 @tpg/ui 是符号链接进来的。
   漏了这行,共享组件的 class 一条都不生成 —— 而且构建不报错。 */
@source "../../../../platform/ui/src";
```

路径从 `<game>/packages/client/src/` 往上数四层到 repo 根。

```bash
for g in black-and-white flip-math add-to-fifty texas-poker; do
  f="$g/packages/client/src/theme.css"
  perl -0pi -e 's{(\@import "tailwindcss";\n)}{$1\n/* Tailwind 默认跳过 node_modules,而 \@tpg/ui 是符号链接进来的。\n   漏了这行,共享组件的 class 一条都不生成 —— 而且构建不报错。 */\n\@source "../../../../platform/ui/src";\n}' "$f"
done
grep -c '@source' black-and-white/packages/client/src/theme.css flip-math/packages/client/src/theme.css add-to-fifty/packages/client/src/theme.css texas-poker/packages/client/src/theme.css
```

perl 的 pattern 会插值，`@import` / `@source` / `@tpg` 里的 `@` 必须写成 `\@`，否则被当成数组变量展开成空串、整条匹配静默失效（阶段 4 踩过）。

Expected: 四行 `1`。

- [ ] **Step 3: 四个 theme.css 加契约块**

契约是这 10 个名字，四个游戏都必须给值。**共享组件只写这些名字，不写任何具体颜色或圆角。**

| token | 用途 |
| --- | --- |
| `--color-ui-surface` | 面板底色 |
| `--color-ui-ink` | 面板上的主文字 |
| `--color-ui-muted` | 次要文字（说明、标签） |
| `--color-ui-accent` | 强调：标题、房间码、主按钮底 |
| `--color-ui-accent-ink` | 主按钮上的文字 |
| `--color-ui-line` | 描边与分隔线 |
| `--color-ui-danger` | 报错文字与危险按钮 |
| `--radius-ui-panel` | 面板圆角 |
| `--radius-ui-control` | 按钮 / 输入框圆角 |
| `--shadow-ui-panel` | 面板阴影 |

取值一律照抄各游戏现有 `Lobby.svelte` 和 `Button.svelte` 里的字面量，所以颜色不变。能指向自己已有 token 的就用 `var()`，指不到的写字面量。

**black-and-white** —— 它一个契约名都没有，全是新的：

```css
/* 共享组件(@tpg/ui)的 token 契约。值指向本游戏已有的颜色,所以
   改 --color-gold 之类,共享组件跟着一起变。 */
@theme {
  --color-ui-surface: var(--color-felt);
  --color-ui-ink: var(--color-felt-text);
  --color-ui-muted: var(--color-gold-muted);
  --color-ui-accent: var(--color-gold);
  --color-ui-accent-ink: var(--color-btn-primary-text);
  --color-ui-line: rgba(217, 178, 91, 0.2);
  /* 大厅报错行现在用的是 text-lose,不是 danger;保持原样。 */
  --color-ui-danger: var(--color-lose);
  --radius-ui-panel: 20px;
  --radius-ui-control: 8px;
  --shadow-ui-panel: 0 8px 40px rgba(0, 0, 0, 0.5);
}
```

**flip-math** —— 它的裸名和契约含义一致，直接指过去：

```css
@theme {
  --color-ui-surface: var(--color-panel);
  --color-ui-ink: var(--color-ink);
  --color-ui-muted: var(--color-muted);
  --color-ui-accent: var(--color-accent);
  --color-ui-accent-ink: var(--color-accent-ink);
  --color-ui-line: var(--color-line);
  --color-ui-danger: var(--color-danger);
  --radius-ui-panel: 16px;
  --radius-ui-control: 8px;
  /* flip-math 的大厅本来就没有阴影。 */
  --shadow-ui-panel: none;
}
```

**add-to-fifty** —— 同样一致：

```css
@theme {
  --color-ui-surface: var(--color-panel);
  --color-ui-ink: var(--color-ink);
  --color-ui-muted: var(--color-muted);
  --color-ui-accent: var(--color-accent);
  --color-ui-accent-ink: var(--color-accent-ink);
  --color-ui-line: var(--color-line);
  --color-ui-danger: var(--color-danger);
  --radius-ui-panel: 8px;
  --radius-ui-control: 8px;
  --shadow-ui-panel: 0 18px 50px rgba(0, 0, 0, 0.28);
}
```

**texas-poker** —— 这个是前缀存在的理由：它的大厅面板是绿毡不是奶油，所以
`--color-ui-ink` 指的是 `--color-felt-text`，和它自己的 `--color-ink`（#15171a，给牌面用的）正好相反。

```css
/* 注意 --color-ui-ink 不是 --color-ink:大厅面板是绿毡(felt),
   上面的字是奶油色;--color-ink 那个近黑色是给奶油色牌面用的。 */
@theme {
  --color-ui-surface: var(--color-felt);
  --color-ui-ink: var(--color-felt-text);
  --color-ui-muted: var(--color-gold-muted);
  --color-ui-accent: var(--color-gold);
  --color-ui-accent-ink: var(--color-ink);
  --color-ui-line: rgba(217, 178, 91, 0.25);
  --color-ui-danger: var(--color-danger);
  --radius-ui-panel: 12px;
  --radius-ui-control: 8px;
  --shadow-ui-panel: 0 18px 50px rgba(0, 0, 0, 0.35);
}
```

四个块都插在现有 `@theme { ... }` 之后、`@layer base` 之前。

- [ ] **Step 4: 四个 Dockerfile 各加两行**

```bash
for g in black-and-white flip-math add-to-fifty texas-poker; do
  perl -0pi -e 's{(COPY platform/client/package\.json \./platform/client/\n)}{$1COPY platform/ui/package.json ./platform/ui/\nCOPY platform/build/package.json ./platform/build/\n}' "$g/Dockerfile"
done
grep -c "platform/ui/package.json" */Dockerfile
for g in black-and-white flip-math add-to-fifty texas-poker; do
  sed -n '/^FROM node:22-alpine AS deps/,/^RUN npm ci/p' "$g/Dockerfile" | shasum | cut -c1-12
done
```

Expected: 四个 `1`；四个 deps 阶段同一个哈希。

`platform/build` 的 package.json 在 Task 8 才建，但 Dockerfile 现在就写上它——反正这两件事要落在同一个 commit 之前不会有人构建镜像。**如果 Task 1 到 Task 8 之间要构建镜像，先把这一行注释掉。** 更稳的做法是 Task 1 只加 `platform/ui` 那行，Task 8 再加 `platform/build` 那行；按这个来。

所以实际执行的是：

```bash
for g in black-and-white flip-math add-to-fifty texas-poker; do
  perl -0pi -e 's{(COPY platform/client/package\.json \./platform/client/\n)}{$1COPY platform/ui/package.json ./platform/ui/\n}' "$g/Dockerfile"
done
```

- [ ] **Step 5: 装进 workspace**

```bash
npm install
ls -l node_modules/@tpg/
```

Expected: `ui -> ../../platform/ui` 出现。

- [ ] **Step 6: 验证 token 生成了工具类**

契约块现在还没有消费者，Tailwind 不会凭空生成工具类（它只生成源码里出现过的 class）。所以这一步先确认 `:root` 上落了 10 个变量：

```bash
for g in black-and-white:@bw flip-math:@fm add-to-fifty:@add-to-fifty texas-poker:@texas-poker; do
  d=${g%%:*}; s=${g##*:}
  npm run build --workspace $s/client >/dev/null 2>&1
  printf "%-18s %s 个 ui token\n" "$d" "$(cat $d/packages/client/dist/assets/*.css | grep -oE '\-\-(color|radius|shadow)-ui-[a-z-]+:' | sort -u | wc -l | tr -d ' ')"
done
```

Expected: 四行都是 `10`。

- [ ] **Step 7: 镜像 deps 阶段仍然能构建**

```bash
docker build --target deps -f black-and-white/Dockerfile -t tpg-deps-check . && echo "deps stage OK"
```

- [ ] **Step 8: format + commit**

```bash
rm -rf */packages/client/dist
npx prettier --write platform/ui '*/packages/client/src/theme.css'
npm run format:check
git add platform/ui package-lock.json '*/packages/client/src/theme.css' '*/Dockerfile'
git commit -m "feat(platform): add @tpg/ui and the token contract"
```

---

### Task 2: Button 与 LangToggle

**Files:**
- Create: `platform/ui/src/Button.svelte`、`platform/ui/src/LangToggle.svelte`
- Modify: `platform/ui/src/index.ts`

**Interfaces:**
- Produces:
  ```svelte
  <Button variant="primary|secondary|ghost|danger" type="button|submit"
          disabled={false} class="" on:click>…</Button>
  <LangToggle lang={"en"|"zh"} onToggle={() => void} />
  ```
  Task 3 的 `Lobby` 和 Task 4–7 的四个游戏都用它们。

- [ ] **Step 1: Button.svelte**

四份实现的 variant 名字不一致（bw/fm 是 `primary|ghost|danger`，a2f/tp 是 `primary|secondary|danger`），统一成四个。几何取 a2f/tp 那套（有 `min-h-[44px]`，是 iOS 的最小可点尺寸），颜色全走 token。

```svelte
<script lang="ts">
  // 共享按钮。颜色一律走 ui-* token —— 这个文件里不该出现任何具体颜色。
  // 额外布局类(w-full 等)经 class 传入,不和 variant 的颜色/内距冲突。
  export let variant: "primary" | "secondary" | "ghost" | "danger" = "primary";
  export let type: "button" | "submit" = "button";
  export let disabled = false;
  let extra = "";
  export { extra as class };

  const base =
    "inline-flex min-h-[44px] cursor-pointer items-center justify-center " +
    "rounded-ui-control border px-5 py-2.5 text-sm font-semibold " +
    "whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-45";

  const variants = {
    primary:
      "border-ui-accent bg-ui-accent text-ui-accent-ink hover:brightness-105",
    secondary: "border-ui-line bg-ui-surface text-ui-ink hover:border-ui-accent",
    ghost:
      "border-ui-line bg-transparent text-ui-muted hover:border-ui-accent hover:text-ui-ink",
    danger: "border-ui-danger bg-ui-danger text-white hover:brightness-105",
  };
</script>

<button {type} {disabled} class={`${base} ${variants[variant]} ${extra}`} on:click>
  <slot />
</button>
```

- [ ] **Step 2: LangToggle.svelte**

四份只差 Button 的 variant。统一用 `secondary` 而不是 spec 说的 `ghost`：语言开关浮在**页面**背景上而不是面板上，`ghost` 是透明底，而 add-to-fifty / texas-poker 的页面底色和面板底色是两回事（深绿页面 + 奶油面板），透明底的 `text-ui-muted` 在深绿上读不出来。`secondary` 自带 `bg-ui-surface`，四个游戏都读得清。

```svelte
<script lang="ts">
  // 挂一次,每个界面都在同一个位置。标签写的是「切过去」的那个语言,
  // 不是当前语言。
  import Button from "./Button.svelte";

  export let lang: "en" | "zh";
  export let onToggle: () => void;
</script>

<div class="fixed right-3 top-3 z-50">
  <Button variant="secondary" on:click={onToggle}>
    {lang === "zh" ? "EN" : "中文"}
  </Button>
</div>
```

- [ ] **Step 3: barrel**

`platform/ui/src/index.ts`：

```ts
// 三个共享组件的 barrel。各游戏 `import { Button, Lobby } from "@tpg/ui"`。
export { default as Button } from "./Button.svelte";
export { default as LangToggle } from "./LangToggle.svelte";
```

- [ ] **Step 4: typecheck**

```bash
npm run typecheck --workspace @tpg/ui
```

Expected: `0 errors and 0 warnings`。

若 `svelte-check` 抱怨解析不了 `./Button.svelte` 的类型，改成让各游戏直接深引
`@tpg/ui/src/Button.svelte`（包里没有 `exports` 字段，任意子路径都能解析），
barrel 保留给能用的那部分。**先试 barrel，不行再退。**

- [ ] **Step 5: commit**

```bash
npx prettier --write platform/ui
git add platform/ui
git commit -m "feat(platform): add the shared Button and LangToggle"
```

---

### Task 3: 共享 Lobby

**Files:**
- Create: `platform/ui/src/Lobby.svelte`
- Modify: `platform/ui/src/index.ts`

**Interfaces:**
- Consumes: `Button`（Task 2）、`LobbyDict`（`@tpg/client`，阶段 4 定的 8 个 key）
- Produces:
  ```svelte
  <Lobby title="" subtitle="" copy={LobbyDict} statusText={string | null}
         roomCode={string | null}
         onCreate={() => void} onJoin={(code: string) => void} onClose={() => void} />
  ```

- [ ] **Step 1: 写组件**

传的是**普通值不是 store**：组件不认识会话层，`$roomCode` / `$t` 在各游戏的调用点解。这样 `@tpg/ui` 不依赖 `@tpg/client` 的运行时，只用它的一个类型。

三处行为在这里统一（spec 5.4 的表）：
- **两步解散确认**——原来只有 flip-math 有。房里可能已经有对手在等，另外三个现在一点就拆。
- **「加入」按钮的可点条件**统一成 `code.trim().length === 6`。`makeRoomCode` 固定生成 6 位，提前挡住比发出去再收 `ROOM_NOT_FOUND` 干净。
- **提交仍按 `code.trim().toUpperCase()` 规整**——其实 `createRoomSession.joinRoom` 里已经做了（阶段 4），这里不重复。

```svelte
<script lang="ts">
  import type { LobbyDict } from "@tpg/client";
  import Button from "./Button.svelte";

  export let title: string;
  /** 空字符串就不渲染这一行 —— flip-math 没有副标题。 */
  export let subtitle = "";
  export let copy: LobbyDict;
  /** 已经翻好的文案,组件不碰词典。 */
  export let statusText: string | null = null;
  export let roomCode: string | null = null;
  export let onCreate: () => void;
  export let onJoin: (code: string) => void;
  export let onClose: () => void;

  let code = "";
  let confirmClose = false;

  // 房间码固定 6 位,不到 6 位直接按不动 —— 比发出去再收 ROOM_NOT_FOUND 干净。
  $: canJoin = code.trim().length === 6;

  function submitJoin(): void {
    if (canJoin) onJoin(code);
  }
</script>

<section
  class="flex w-full max-w-[420px] flex-col items-center gap-5 rounded-ui-panel border border-ui-line bg-ui-surface p-8 shadow-ui-panel"
>
  <div class="flex flex-col items-center gap-2 text-center">
    <h1 class="text-2xl font-black text-ui-accent">{title}</h1>
    {#if subtitle}
      <p class="text-sm leading-6 text-ui-muted">{subtitle}</p>
    {/if}
  </div>

  {#if roomCode}
    <div
      class="flex w-full flex-col items-center gap-1 rounded-ui-control border border-ui-line px-6 py-4 text-center"
    >
      <span class="text-xs uppercase tracking-[1px] text-ui-muted">
        {copy.roomCode}
      </span>
      <strong class="text-4xl font-black tracking-[6px] text-ui-accent">
        {roomCode}
      </strong>
      <span class="mt-1 text-sm text-ui-muted">{copy.waitingOpponent}</span>
    </div>

    {#if confirmClose}
      <div class="flex w-full items-center justify-center gap-3">
        <Button
          variant="danger"
          on:click={() => {
            confirmClose = false;
            onClose();
          }}
        >
          {copy.confirmClose}
        </Button>
        <Button variant="ghost" on:click={() => (confirmClose = false)}>
          {copy.cancel}
        </Button>
      </div>
    {:else}
      <Button
        variant="ghost"
        class="w-full"
        on:click={() => (confirmClose = true)}
      >
        {copy.closeRoom}
      </Button>
    {/if}
  {:else}
    <Button class="w-full" on:click={onCreate}>{copy.createRoom}</Button>

    <form class="flex w-full items-center gap-2" on:submit|preventDefault={submitJoin}>
      <input
        class="min-h-[44px] min-w-0 flex-1 rounded-ui-control border border-ui-line bg-transparent px-3 text-center text-base font-semibold uppercase tracking-[4px] text-ui-ink outline-none transition focus:border-ui-accent placeholder:text-sm placeholder:font-normal placeholder:tracking-[1px] placeholder:text-ui-muted"
        bind:value={code}
        maxlength="6"
        placeholder={copy.codePlaceholder}
      />
      <Button variant="secondary" type="submit" disabled={!canJoin}>
        {copy.join}
      </Button>
    </form>
  {/if}

  {#if statusText}
    <p class="text-center text-sm text-ui-danger">{statusText}</p>
  {/if}
</section>
```

- [ ] **Step 2: barrel 加一行**

```ts
// 三个共享组件的 barrel。各游戏 `import { Button, Lobby } from "@tpg/ui"`。
export { default as Button } from "./Button.svelte";
export { default as LangToggle } from "./LangToggle.svelte";
export { default as Lobby } from "./Lobby.svelte";
```

- [ ] **Step 3: typecheck + commit**

```bash
npm run typecheck --workspace @tpg/ui
npx prettier --write platform/ui
git add platform/ui
git commit -m "feat(platform): add the shared Lobby"
```

---

### Task 4: black-and-white 接入

先做 bw：它是四个里唯一一个契约 token 全是新增的，也是唯一在牌桌界面用 `Button` 的（`Table.svelte` / `Review.svelte`），接缝走得最全。

**Files:**
- Delete: `black-and-white/packages/client/src/lib/{Button,LangToggle,Lobby}.svelte`
- Modify: `black-and-white/packages/client/src/App.svelte`
- Modify: `black-and-white/packages/client/src/lib/{Table,Review}.svelte`（Button 的 import 路径）
- Modify: `black-and-white/packages/client/package.json`

- [ ] **Step 1: 加依赖**

```json
  "dependencies": {
    "@bw/shared": "*",
    "@tpg/client": "*",
    "@tpg/ui": "*",
    "socket.io-client": "^4.7.0"
  },
```

- [ ] **Step 2: 删三个本地组件、改 import**

```bash
cd black-and-white/packages/client/src
rm lib/Button.svelte lib/LangToggle.svelte lib/Lobby.svelte
# Button 的引用:lib/ 下的组件写 "./Button.svelte",App 写 "./lib/Button.svelte"
grep -rln 'Button.svelte\|LangToggle.svelte\|Lobby.svelte' . 
```

把每处 `import Button from "./Button.svelte";`（或 `"./lib/Button.svelte"`）换成
`import { Button } from "@tpg/ui";`，`LangToggle` 和 `Lobby` 同理。同一个文件里
引了多个就合成一句 `import { Button, LangToggle, Lobby } from "@tpg/ui";`。

- [ ] **Step 3: App.svelte 里给 Lobby 传 props**

原来是 `<Lobby />`（它自己去 import store 和 t）。现在值从调用点传：

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { Button, LangToggle, Lobby } from "@tpg/ui";
  import {
    view,
    review,
    ended,
    roomCode,
    status,
    createRoom,
    joinRoom,
    tryRejoin,
    leaveRoom,
  } from "./socket";
  import { lang, t, toggleLang } from "./i18n";
  import Table from "./lib/Table.svelte";
  import Review from "./lib/Review.svelte";

  onMount(tryRejoin);
</script>

<div class="flex min-h-screen w-full items-center justify-center">
  <LangToggle lang={$lang} onToggle={toggleLang} />
  {#if $ended}
    …（原样不动）…
  {:else if $review}
    <Review review={$review} />
  {:else if $view}
    <Table view={$view} />
  {:else}
    <Lobby
      title={$t.title}
      subtitle={$t.subtitle}
      copy={$t.lobby}
      statusText={$status ? $t.status[$status] : null}
      roomCode={$roomCode}
      onCreate={createRoom}
      onJoin={joinRoom}
      onClose={leaveRoom}
    />
  {/if}
</div>
```

注意 `App.svelte` 现在要多引 `roomCode` / `status` / `createRoom` / `joinRoom`（原来这些是 `Lobby.svelte` 自己引的）和 `lang` / `toggleLang`。

- [ ] **Step 4: 装依赖、svelte-check、测试**

```bash
npm install
npm run check --workspace @bw/client
npm test --workspace @bw/client
git diff --stat black-and-white/packages/server
```

Expected: `0 errors and 0 warnings`；`Tests 1 passed`；server diff 为空。

- [ ] **Step 5: 浏览器验收**

```bash
npm run start --workspace @bw/server &
```
然后 `preview_start` 开 `bw-client`（5173）。

要确认的七件事——**第一条最要紧，它是 `@source` 有没有生效的判据**：

1. **大厅有样式**：面板是绿毡底、金色标题、有圆角和阴影。如果看到的是一堆没有样式的裸文字和裸按钮，就是 `@source` 那行没生效。
2. 「创建房间」能建房，房间码显示出来，下面那句还是「发给朋友，等待对手加入…」
3. **解散房间现在是两步**：点一次出现「确认解散 / 取消」，点取消能退回去
4. 房间码输入框输入 5 位时「加入」是灰的，第 6 位输进去才亮
5. 右上角语言开关能切换，切换后刷新还在
6. 牌桌界面的按钮（出牌 / 退出）样式正常——它们也换成了共享 Button
7. 控制台没有 error

- [ ] **Step 6: format + commit**

```bash
npx prettier --write black-and-white/packages/client
npm run format:check
git add black-and-white package-lock.json
git commit -m "refactor(black-and-white): use the shared UI components"
```

---

### Task 5: flip-math 接入

同 Task 4 的做法。flip-math 的差异：没有副标题（`subtitle` 传空字符串或不传），`Hud.svelte` / `GameOver.svelte` / `Board.svelte` 里也用 `Button`。

- [ ] **Step 1: 加依赖** `"@tpg/ui": "*"` 到 `flip-math/packages/client/package.json` 的 dependencies。

- [ ] **Step 2: 删 `lib/{Button,LangToggle,Lobby}.svelte`，把所有 import 换成 `@tpg/ui`。**

- [ ] **Step 3: App.svelte 传 props。** `subtitle` 不传（组件默认空字符串，不渲染那一行）：

```svelte
<Lobby
  title={$t.title}
  copy={$t.lobby}
  statusText={$status ? $t.status[$status] : null}
  roomCode={$roomCode}
  onCreate={createRoom}
  onJoin={joinRoom}
  onClose={leaveRoom}
/>
```

`App.svelte` 要多引 `roomCode` / `status` / `createRoom` / `joinRoom` / `lang` / `toggleLang`。

- [ ] **Step 4: 检查**

```bash
npm install && npm run check --workspace @fm/client && npm test --workspace @fm/client && npm test --workspace @fm/server
```

Expected: `0 errors`；client 1 个；server 9 个。

- [ ] **Step 5: 浏览器验收**（5174）：大厅有样式、没有副标题那一行、两步解散（它本来就有，确认没退化）、6 位才能加入、准备/抢答按钮正常、控制台干净。

**不要在 dev server 跑着的时候改配置文件**——会让 vite-plugin-svelte 重启 vite，`--strictPort` 下和旧监听抢端口直接 exit 1（阶段 1 踩过）。撞上了 `lsof -ti:5174 | xargs kill` 再起。

- [ ] **Step 6: commit** `refactor(flip-math): use the shared UI components`

---

### Task 6: add-to-fifty 接入

差异：副标题是 `$t.tagline` 不是 `$t.subtitle`（它那一位写的是一句较长的玩法说明），按 props 名传过去就行，不动词典。`GameOver.svelte` 里也用 `Button`。

- [ ] **Step 1: 加依赖。**
- [ ] **Step 2: 删三个本地组件，改 import。**
- [ ] **Step 3: App.svelte 传 props：**

```svelte
<Lobby
  title={$t.title}
  subtitle={$t.tagline}
  copy={$t.lobby}
  statusText={$status ? $t.status[$status] : null}
  roomCode={$roomCode}
  onCreate={createRoom}
  onJoin={joinRoom}
  onClose={leaveRoom}
/>
```

- [ ] **Step 4: 检查** `npm install && npm run check --workspace @add-to-fifty/client && npm test --workspace @add-to-fifty/client && npm test --workspace @add-to-fifty/server`（1 / 6）
- [ ] **Step 5: 浏览器验收**（5175）：大厅面板是奶油底深色字、玩法说明那行在、**两步解散是新增的**、6 位才能加入、右上角语言开关在深绿页面上读得清（这是 spec 那处 `ghost` → `secondary` 修正要防的）、牌桌正常、控制台干净。
- [ ] **Step 6: commit** `refactor(add-to-fifty): use the shared UI components`

---

### Task 7: texas-poker 接入

差异最大的一个：它的 `App.svelte` 有 854 行，里面用 `Button` 的地方最多；`--color-ui-ink` 指的是 `felt-text` 而不是它自己的 `--color-ink`（Task 1 已处理）。

- [ ] **Step 1: 加依赖。**
- [ ] **Step 2: 删三个本地组件，改 import。**`grep -n 'Button' texas-poker/packages/client/src/App.svelte | head -30` 先看一遍用量。
- [ ] **Step 3: App.svelte 传 props：**

```svelte
<Lobby
  title={$t.title}
  subtitle={$t.subtitle}
  copy={$t.lobby}
  statusText={$status ? $t.status[$status] : null}
  roomCode={$roomCode}
  onCreate={createRoom}
  onJoin={joinRoom}
  onClose={leaveRoom}
/>
```

- [ ] **Step 4: 检查** `npm install && npm run check --workspace @texas-poker/client && npm test --workspace @texas-poker/client && npm test --workspace @texas-poker/server`（1 / 8）
- [ ] **Step 5: 浏览器验收**（5176）：大厅是绿毡面板配奶油字（**不是**近黑字——那就说明 `--color-ui-ink` 指错了）、副标题在、两步解散是新增的、6 位才能加入、牌桌上的动作按钮（弃牌/跟注/加注/全下）样式正常、设置弹窗里的按钮正常、控制台干净。
- [ ] **Step 6: commit** `refactor(texas-poker): use the shared UI components`

---

### Task 8: platform/build

**Files:**
- Create: `platform/build/package.json`、`platform/build/src/viteConfig.ts`、`platform/build/tsconfig.base.json`
- Modify: 四个 `vite.config.ts`、四个 `tsconfig.json`、四个 `package.json`、四个 `Dockerfile`

- [ ] **Step 1: 建包**

四份 `vite.config.ts` 语义上完全一样（只有 bw 是多行写法，另三个压成一行）。四份 `tsconfig.json` 也一样，只有 tp 的 key 顺序不同。

`platform/build/package.json` —— 这个包要背构建工具的依赖，所以单独开而不放进 `platform/ui`（那是运行时组件包，不该背构建依赖）：

```json
{
  "name": "@tpg/build",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/viteConfig.ts",
  "dependencies": {
    "@sveltejs/vite-plugin-svelte": "^7.2.0",
    "@tailwindcss/vite": "^4.3.1",
    "svelte-preprocess": "^6.0.5",
    "vite": "^8.2.0"
  }
}
```

- [ ] **Step 2: viteConfig.ts**

```ts
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import preprocess from "svelte-preprocess";
import type { UserConfig } from "vite";

export interface GameViteOptions {
  /** dev server 端口。不给就用 vite 默认的 5173。 */
  port?: number;
}

/**
 * 四个游戏的 client 共用这一份。dev 时 /socket.io 反代到本地游戏服务器,
 * 生产是同源,由 Caddy 转发,所以这条规则只影响 dev。
 */
export function gameViteConfig(opts: GameViteOptions = {}): UserConfig {
  return {
    plugins: [tailwindcss(), svelte({ preprocess: preprocess() })],
    server: {
      ...(opts.port ? { port: opts.port, strictPort: true } : {}),
      proxy: { "/socket.io": { target: "http://localhost:3001", ws: true } },
    },
  };
}
```

- [ ] **Step 3: tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "lib": ["ESNext", "DOM", "DOM.Iterable"]
  }
}
```

- [ ] **Step 4: 四个游戏改过来**

`<game>/packages/client/vite.config.ts` 缩成：

```ts
import { gameViteConfig } from "@tpg/build";

export default gameViteConfig({ port: 5173 });
```

（端口分别 5173 / 5174 / 5175 / 5176；写进 config 之后 `.claude/launch.json` 里那串 `--port xxxx --strictPort` 参数就可以去掉。）

`<game>/packages/client/tsconfig.json` 缩成：

```json
{
  "extends": "@tpg/build/tsconfig.base.json",
  "include": ["src/**/*.ts", "src/**/*.svelte"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

四个 `package.json` 的 devDependencies 加 `"@tpg/build": "*"`，并把已经由
`@tpg/build` 带进来的 `@sveltejs/vite-plugin-svelte` / `@tailwindcss/vite` /
`svelte-preprocess` / `vite` 留着——`vite` 是 `npm run dev` 直接调的命令，
`tailwindcss` 也还要作为 `@tailwindcss/vite` 的 peer 存在。**只加不删**，
减依赖的收益不值得再触发一次阶段 1 那种 npm 解析问题。

- [ ] **Step 5: Dockerfile 补 platform/build 那一行**

```bash
for g in black-and-white flip-math add-to-fifty texas-poker; do
  perl -0pi -e 's{(COPY platform/ui/package\.json \./platform/ui/\n)}{$1COPY platform/build/package.json ./platform/build/\n}' "$g/Dockerfile"
done
grep -c "platform/build/package.json" */Dockerfile
```

- [ ] **Step 6: 检查**

```bash
npm install
npm run check --workspaces --if-present
npm test --workspaces --if-present
```

四个 dev server 各起一次确认端口对、`/socket.io` 代理还在。

- [ ] **Step 7: commit** `feat(platform): share the vite config and tsconfig base`

---

### Task 9: 阶段验收与合并

- [ ] **Step 1: 全量测试** —— `npm test --workspaces --if-present`，应当仍是 214（本阶段不加测试：共享组件的判据是浏览器，不是断言）。

- [ ] **Step 2: 四个 svelte-check + 三个 platform typecheck + `@tpg/ui` 的 svelte-check** 全绿。

- [ ] **Step 3: 八个镜像构建** —— 每个游戏的 `server` 和 `web` target。`web` 跑 `vite build`，是 `@source` 之外的第二道关：它能证明共享组件的 TS 编译得过（但**证明不了**样式生成了）。

- [ ] **Step 4: 四个 compose 栈起来，socket.io 握手拿到 sid。**

- [ ] **Step 5: 四个大厅截图比对。** 这一步是本阶段的验收核心。每个游戏截一张大厅图，确认：面板颜色是本游戏自己的、标题是 accent 色、两步解散生效、加入按钮 6 位才亮。

- [ ] **Step 6: 把三处修正写回 spec**（5.2 的 token 名加前缀、5.4 的 `LangToggle` 用 `secondary`、5.6 的「像素不变」改成「几何统一、颜色按 token」）。

- [ ] **Step 7: 勾完 checkbox，commit** `docs: mark phase 5 complete, correct the spec's UI section`

- [ ] **Step 8: 合回 main**

```bash
git checkout main
git merge --no-ff platform-ui -m "Merge branch 'platform-ui': share the lobby, button and language toggle"
```

- [ ] **Step 9: merge 后复验**（测试、svelte-check、工作区干净）。**不要 `git push`。**
