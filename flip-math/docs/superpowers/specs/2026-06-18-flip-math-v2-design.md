# 《翻牌数式》v2 增量 — 设计文档

> 在已上线的 flip-math 基础上加 5 项:解散房间、准备环节、3-2-1 倒数、已选移到右侧(宽屏)、
> 更大更直观的界面。延续既有架构(纯引擎 + 服务器权威 + 计时层 + Svelte)。
> v1 设计见 `2026-06-18-flip-math-design.md`。

## 1. 新阶段与回合流程(引擎)

### 1.1 Phase 扩充
新增两个阶段,完整集合:
`waiting | ready | preview | reveal | countdown | buzzing | answering | resolve | finished`
- `ready` — **准备门**:等双方各点一次"准备"。**无 deadline**(无限等待)。
- `countdown` — **3-2-1 倒数**:`deadline = now + countdownMs(3000)`,纯展示,结束自动出题。

### 1.2 完整流程
```
加入 → ready(开局) → [双方准备] → preview(10s)
     → countdown(第1回合,无记忆翻牌) → buzzing(生成并展示目标 + 开抢)
     → answering / resolve …(不变)
答对且未满 10 分 → ready → [双方准备] → reveal(3s 记忆翻牌)
     → countdown(3-2-1) → buzzing(新目标) → …
答对且满 10 分(WIN_SCORE) → finished(跳过 reveal/ready/countdown)
答错 / 超时 → 换人 answering(不变)
```
要点:
- **第 1 回合无记忆翻牌**(还没有可回忆的东西);开局那次准备即第 1 回合的准备,预览刚结束不再二次准备。
- **目标在 `countdown` 期间为 `null`**,进入 `buzzing` 才 `generateTarget` 并展示。
- 记忆翻牌游标 `revealIndex` 仍由 `REVEAL_DONE` 推进(左上→右下,%16 循环);第 2 回合的 reveal 展示 0 号格,符合"左上先翻"。

### 1.3 GameState 新增字段
- `ready: Record<PlayerId, boolean>` — 当前准备门里各玩家是否已确认。
- `readyNext: 'preview' | 'reveal'` — 当前准备门确认完后要进入的阶段。

### 1.4 动作与 reducer 改动
- 新动作 `{ type: 'READY'; player: PlayerId }`:仅在 `ready` 阶段合法;置该玩家 `ready=true`;
  **若双方都 true** → 进入 `readyNext`:
  - `readyNext==='preview'` → `preview`,`deadline=now+previewMs`。
  - `readyNext==='reveal'` → `reveal`,`revealedCells=[revealIndex]`,`deadline=now+revealMs`。
- 新计时动作 `{ type: 'COUNTDOWN_DONE' }`:仅在 `countdown` 合法 → `buzzing`,
  `target=generateTarget(board)`,`active=null`,`selection=[]`,`revealedCells=[]`,`deadline=null`。
- 改 `PREVIEW_DONE`:`preview` → **`countdown`**(原先 → buzzing),`deadline=now+countdownMs`,target 保持 null。
- 改 `REVEAL_DONE`:`reveal` → **`countdown`**(原先 → buzzing);仍 `revealIndex=(revealIndex+1)%16`;`deadline=now+countdownMs`。
- 改 `RESOLVE_DONE`(答对且未满 WIN_SCORE 分支):→ **`ready`**(原先 → reveal),
  置 `readyNext='reveal'`、`ready={p1:false,p2:false}`、`selection=[]`、`revealedCells=[]`、`deadline=null`、`lastResolve=null`。
  (答对且满分 → `finished` 不变;答错 → 换人 `answering` 不变。)
- `createGame(ctx)`:起始 `phase='ready'`、`readyNext='preview'`、`ready={p1:false,p2:false}`、
  `target=null`、`deadline=null`(准备门无限等)。**`rematch` 走同一条 `createGame`**,因此也从开局准备开始。

### 1.5 Durations
`Durations` 加 `countdownMs`(默认 3000)。其余不变(preview 10000 / answer 5000 / reveal 3000 / resolve 1500)。

### 1.6 ClientView 新增
- `ready: { me: boolean; opp: boolean }`(由 `state.ready` 按视角映射)。
- 其余字段不变;`target`/`deadline`/`phase`/`revealedCells`/`selection`/`scores` 等照旧。

## 2. 服务器(计时层)
- `TIMEOUT_ACTION` 表加 `countdown: { type: 'COUNTDOWN_DONE' }`;`ready` 不在表中(无 deadline,不排计时器)。
- 新增 socket 事件 `ready`:`session.dispatch({ type:'READY', player: myId })`(经 `isRecord` 不需要;无 payload)。
  非 `ready` 阶段或重复点击由 reducer 安全处理(重复置 true 幂等;非法阶段抛错→静默忽略,避免噪声)。
- `preview`/`reveal`/`countdown` 的计时器照常由 `scheduleTimer` 驱动。
- **掉线兜底**:`ready` 阶段无计时器,若一方掉线卡住,连线方可用"退出"(`leave_room` 判对方胜)或等重连——不会真正死锁。无需新增 forfeit 逻辑。

## 3. 客户端

### 3.1 socket store
- 加 `ready()` 导出(`socket.emit('ready')`)。
- `ClientView` 类型同步(含 `ready`)。

### 3.2 阶段渲染(App + 组件)
- `App.svelte` 路由不变(ended → GameOver → 游戏内 → Lobby);游戏内根据 `view.phase` 切换 Hud/Board 表现。
- `Hud.svelte` 各阶段:
  - `ready`:大"准备"按钮;本方已准备则显示"已准备,等待对方…";展示双方准备状态(如两个对勾)。
  - `preview`:"记住每格的背面!"(不变)。
  - `countdown`:大数字 `ceil((deadline-now)/1000)`(3/2/1)。
  - `buzzing`:"抢答"按钮 + 目标。
  - `answering`:"你来作答(点 3 张组成算式)" / "对方作答中…"。
  - `reveal`:"记忆提示中…"。

### 3.3 已选面板(宽屏右侧 / 窄屏上方)
- 宽屏(容器够宽):棋盘右侧"你的选择"面板,按点击顺序列字母(反面隐藏,选满 3 张才翻面);
  对方作答时该面板标题/内容相应显示对方已选字母。
- 窄屏:回退到棋盘上方状态区(现状)显示已选字母列表。
- 实现:游戏内布局用响应式(如 CSS 容器/媒体查询或 flex-wrap);把"已选/对方选择"列表抽成一个 `Selection.svelte` 小组件,在宽屏放右栏、窄屏放 Hud 内,避免重复 class。

### 3.4 更大/更直观(按已批准 mockup)
- 目标 ≈ 60px、棋盘字母 ≈ 30px、比分 ≈ 26px、主按钮更大、阶段文案更明确。
- 集中在 `theme.css`(必要的字号 token)与组件工具类调整;不复制重复 class;尽量不写 scoped `<style>`。

### 3.5 解散房间 + 退出(都二次确认)
- Lobby 等待界面(`roomCode` 已建、无 `view`):加"解散房间"按钮 → 二次确认(组件内确认态)→ `leaveRoom()`(已含 `leave_room` + 清 localStorage;服务器在未开局时直接删房)。
- 游戏内"退出"按钮:点击 → 二次确认 → `leaveRoom()`(对局中 → 服务器通知对方 `opponent_left` 判胜)。
- 确认 UI:组件内两步(点一次变"确认解散?/确认退出?",再点执行;或就地小提示)。不引第三方弹窗库。

## 4. 测试

### 4.1 shared(更新 + 新增)
- **更新受影响的既有用例**:`PREVIEW_DONE` 现在 → `countdown`(非 buzzing);`REVEAL_DONE` → `countdown`;
  `RESOLVE_DONE` 答对 → `ready`(非 reveal);`createGame` 起始 `phase==='ready'`。把这些断言改对。
- **新增**:
  - `READY`:单方点 → 仍 `ready` 且对方未 ready;双方点 → 进入 `readyNext`(分别测 'preview' 与 'reveal' 两条);非 `ready` 阶段 `READY` 抛错;重复 `READY` 幂等。
  - `COUNTDOWN_DONE`:`countdown` → `buzzing` 且 `target` 非空、在 `solvableTargets` 内、`deadline=null`。
  - 流程顺序:`createGame → READY×2 → preview → PREVIEW_DONE → countdown → COUNTDOWN_DONE → buzzing(target)`;
    以及答对后 `RESOLVE_DONE → ready → READY×2 → reveal → REVEAL_DONE → countdown → COUNTDOWN_DONE → buzzing`。
  - 满 10 分仍直接 `finished`(跳过 ready/reveal/countdown)。
- `toClientView`:含 `ready:{me,opp}` 正确映射。

### 4.2 server(集成,更新)
- 改造既有流程:加入后视图应为 `phase==='ready'`;两端各 `emit('ready')` 后才 `preview`;
  `preview→countdown→buzzing` 自动推进(用极短 `countdownMs` 注入);断言 **`target` 在 ready/preview/countdown 阶段为 null,仅 `buzzing` 出现**。
- "play to a win" 流程相应加上每回合 `ready`(双方 emit)+ 等 `countdown` 过去 → `buzzing` 再抢答作答。
- 保留服务器权威性回归(非己方作答被拒、得分只由服务器结算)。`FAST` durations 加 `countdownMs`。

### 4.3 client
- `svelte-check` 0/0;轻量。

## 5. 不变量 / 范围
- **无新增隐藏信息**:`ready` 标记、`countdown`、目标展示时机都是公开的公平性状态;不需要防泄露裁剪。
- 服务器权威、纯引擎、房间码/rejoin/TTL 清扫、部署契约均不变。
- 仅改 flip-math;不动其它游戏与 proxy。

## 6. 受影响文件(预判)
- `packages/shared/src/types.ts`(Phase/GameState/Action/Durations/ClientView)、`src/game.ts`(createGame/reduce/toClientView/DURATIONS)、`test/game.test.ts`。
- `packages/server/src/gameSession.ts`(TIMEOUT_ACTION)、`src/index.ts`(`ready` 事件)、`test/integration.test.ts`。
- `packages/client/src/socket.ts`、`src/theme.css`、`src/App.svelte`、`src/lib/{Hud,Board,Lobby,GameOver}.svelte`、新增 `src/lib/Selection.svelte`、可能新增 `src/lib/Countdown.svelte`。
