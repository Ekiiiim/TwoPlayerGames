# 《翻牌数式》(flip-math) — 设计文档

> 双人在线竞技:记忆 + 心算 + 抢答。
> 本 repo 的 `black-and-white/`(BW)是参照实现;本游戏复用同一套架构(权威服务器 +
> 纯函数规则引擎 + 房间码配对 + rejoin/rematch + TTL 清扫),并新增
> **服务器端实时计时层**。
> 与 BW 不同:本游戏**没有 preview 之后的隐藏信息**(整盘对双方公开),服务器权威只为
> **公平**(判定/计时/计分),不为保密。

## 1. 命名与部署标识

| 项 | 值 |
|---|---|
| 文件夹 | `flip-math/` |
| 包作用域 | `@fm/shared`、`@fm/server`、`@fm/client` |
| 子域名 | `flipmath.minyu.me` |
| Docker 服务/镜像前缀 | `fm-web` / `fm-server` |

## 2. 游戏规则(权威定义)

### 2.1 游戏板
- 4×4 共 **16 格**。每格有正反两面:
  - **正面**:一个**不重复**的大写英文字母,按阅读顺序 **A–P**(0 号格=A,15 号格=P)。
    字母只是稳定的"记忆标签",不影响判定;格子在内部以索引 0–15 标识。
  - **反面**:固定多重集合 **{1,2,…,12, +, −, ×, ÷}**(数字 1–12 各一次、四个运算符各一次,
    正好 16 个,**无重复**),随机打乱后铺到 16 格。
- 客户端点击以**格子索引**与服务器通信;字母仅作展示。

### 2.2 开局预览
- 双方都连入后进入 `preview` 阶段:**所有 16 格的反面**展示 **10 秒**。
- 10 秒后全部翻到正面(字母),进入第一回合。

### 2.3 回合流程
每回合:
1. **目标数字**:系统给出一个目标数(生成方式见 2.4,**保证可解**)。
2. **抢答(buzz)**:自由抢答,双方都可按"抢答"。服务器按**消息到达顺序**裁定首位抢答者,
   该玩家获得首次答题权。
3. **作答(5 秒)**:答题玩家按点击顺序选**正好 3 张**不同的格子,组成 `数字 运算符 数字`
   的算式,使结果等于目标数。
   - 选择过程中**只高亮字母,不显示任何反面**(对答题者本人也不显示反面——这正是记忆考验)。
   - **双方**都能实时看到答题者已选的字母(按点击顺序列出),例如"对方选择:A F";但看不到反面。
   - 答题者可**撤销**:再次点击已选格即取消;集齐 **3 张不同格** 才结算(5 秒计时不因撤销重置)。
   - 选满第 3 张时,3 张**一起翻面**展示给**双方**(`resolve`):
     - **正确** → 答题者 +1 分 → 若达 `WIN_SCORE` 则**直接 `finished`**(跳过 reveal),否则进入 `reveal`。
     - **错误** → 3 张翻回 → 答题权**换给对方**,重新计 5 秒(见 2.5 交替规则)。
     - **5 秒内不足 3 张(超时)** → 答题权换给对方,**不翻面**(无信息泄露)。
4. **记忆翻牌(3 秒)**:`reveal` 阶段系统翻开**一格**展示反面 3 秒帮助双方记忆,
   按 **左上→右下** 顺序逐回合推进;16 格全部翻完后**循环**回到左上重新依次翻。
5. 之后进入下一回合的抢答;若有人达到 **10 分** 则 `finished`。

### 2.4 目标数字生成(保证可解)
- 枚举当前牌面上所有 `(数字格_i op 运算符格 数字格_j)` 组合(i≠j,op 取牌面上的运算符格):
  - 计算 `a op b`,只保留**正整数**结果(÷ 必须整除、− 必须为正)。
- 收集所有可得的不同结果,**随机取一个**作为目标 → 至少存在一个合法三张解。

### 2.5 合法算式与交替规则
- 合法算式:`c1 op c3`,其中 **c1、c3 为数字格,c2 为运算符格,三张互不相同**,
  且 `c1 op c3 === 目标` 并为正整数(÷ 整除、结果 >0)。
- **抢答只决定"首次"答题者**。首次作答失败(错误或超时)后,进入**强制交替**:
  A→B→A→… 每次 5 秒,**无需再次抢答**,直到有一方答对。
- 因为目标保证可解,所以**不存在作废回合**——每回合最终都会被某人答对并得分。
- 已知取舍:若某玩家持续"超时不选满 3 张"恶意拖延,理论上回合不会结束。v1 接受此风险
  (双方有竞争激励答对),后续可加保护(如连续 N 次超时判负)。

### 2.6 胜负
- 率先达到 **10 分** 者获胜,进入 `finished`,可 `rematch`(重新随机牌面 + 新的 10 秒预览)。

### 2.7 可调常量
`PREVIEW_MS=10000`、`ANSWER_MS=5000`、`REVEAL_MS=3000`、`RESOLVE_SHOW_MS=1500`
(3 张翻面后停留多久再翻回/继续)、`WIN_SCORE=10`、`BOARD=4×4`。

## 3. 架构

延续 BW:`shared` 纯引擎、`server` 权威方、`client` Svelte。**唯一新增**是服务器端实时计时层。

### 3.1 核心抉择:纯引擎 + 服务器持钟
- `shared/` 保持**纯函数 `state + action → newState`,无 IO、无真实时钟**。
- 所有**定时转换**只是普通 action:`PREVIEW_DONE`、`ANSWER_TIMEOUT`、`RESOLVE_DONE`、
  `REVEAL_DONE`。**服务器**持有 `setTimeout` 墙钟,到点时把对应 action 注入 reducer 再广播。
- 收益:规则引擎 100% 可单测(测试直接喂 timeout action,无需假时钟);符合 repo 范式。
- 已否决的方案:把流程逻辑放进 server(违反"shared=可复用规则引擎"、丢失纯单测);
  引入状态机库(过度设计)。

### 3.2 `shared/`(`@fm/shared`)
**类型**
- `Phase = 'waiting' | 'preview' | 'buzzing' | 'answering' | 'resolve' | 'reveal' | 'finished'`
  (`resolve` = 3 张翻面停留 `RESOLVE_SHOW_MS` 的短阶段;之后 `RESOLVE_DONE` 依
  `lastResolve.correct` 分支:对→`reveal`,错→翻回并切到对方 `answering`)
- `PlayerId = 'p1' | 'p2'`
- `CellBack`:`{ kind: 'num', value: 1..12 } | { kind: 'op', op: '+'|'-'|'*'|'/' }`
- `Cell`:`{ index: 0..15, letter: 'A'..'P', back: CellBack }`(权威状态;反面 preview 后对双方公开)
- `GameState`:`board: Cell[]`、`scores: Record<PlayerId, number>`、`phase`、
  `target?: number`、`active?: PlayerId`(当前答题者)、
  `selection: number[]`(当前答题者已选索引,≤3)、`revealIndex: number`(记忆翻牌游标)、
  `revealedCells: number[]`(**渲染提示**:当前应翻到反面的格子——reveal 单格 / resolve 的 3 张;
  非可见性过滤,客户端本就持有整盘)、
  `lastResolve?: { cells: number[]; correct: boolean }`、`deadline?: number`(当前计时阶段的
  到点时间戳,供客户端倒计时 & 服务器持钟)、`winner?: PlayerId`。
- `ClientView`:面向单个玩家的视图(含**整盘** board,因为本游戏无 preview 后的机密;
  另含 me/opp 比分、`winner`、是否轮到我、目标、`deadline`、`selection`、`revealedCells`、`phase` 等)。
  终局也走它(`phase='finished'` + `winner`),不再单设回放结构。

**纯函数**
- `createGame()`:随机牌面(打乱 16 反面、A–P 标签)、`phase='preview'`、置 `deadline`。
- `generateTarget(board)`:见 2.4,返回目标(并可返回解集供测试/校验)。
- `validateAnswer(board, [c1,c2,c3], target)`:见 2.5。
- `reduce(state, action)`:动作 `START | PREVIEW_DONE | BUZZ(player) | SELECT(player, cell)
  | ANSWER_TIMEOUT | RESOLVE_DONE | REVEAL_DONE | REMATCH`。每个 action 校验阶段/归属合法性
  (非法即抛错或忽略),并在进入新计时阶段时刷新 `deadline`。
  `SELECT` 为**切换**语义:点未选格加入、点已选格移除;集齐 **3 张不同格**才触发 resolve 结算。
- `toClientView(state, id)`:整理成单玩家视角(me/opp、`winner` 等),**不裁剪反面**(§3.5);
  终局信息也走它(`phase='finished'`)。

### 3.3 `server/`(`@fm/server`)
- 复用 BW 的 `RoomRegistry`、`GameSession`(players/token/rejoin/empty-TTL)、CORS 策略、
  socket 事件骨架(`create_room`/`join_room`/`rejoin`/`rematch`/`leave_room`/`disconnect`)。
- **新增 每会话计时层**(`GameSession` 内):
  - `scheduleDeadline()`:读取 `state.deadline`,设一个 `setTimeout`;到点时:
    根据当前 `phase` 注入对应 timeout action(`preview→PREVIEW_DONE`、
    `answering→ANSWER_TIMEOUT`、`resolve→RESOLVE_DONE`、`reveal→REVEAL_DONE`),
    `reduce` 后**广播视图**,并为下一个计时阶段重新排程。
  - 任何把状态推进到新计时阶段的玩家动作(如 `BUZZ`、选满 3 张触发 resolve)也调用 `scheduleDeadline()`。
  - 切换/重开计时务必 `clearTimeout` 旧定时器,避免双触发。`unref()` 不让定时器吊住进程。
- **玩家事件**:`buzz`、`select_cell({ index })`(均经 `isRecord` 守卫 + 阶段/归属校验,
  失败发 `error_msg`)。`select_cell` 累加 `selection`,选满 3 张即在 reducer 内结算。
- **断线**:墙钟**不暂停**(防止靠掉线拖延思考);`rejoin` 用 `deadline - now` 同步剩余时间;
  长时间掉线 → 给对方判 forfeit 胜(沿用 BW `opponent_left`/`opponent_disconnected` 思路)。
- **下发事件**:`view_update`(每次状态变化广播视图;仅按玩家整理 me/opp,不裁剪反面;
  终局也用它,`phase='finished'`)、`error_msg`、`opponent_*`(reconnected/disconnected/left)。

### 3.4 `client/`(`@fm/client`)
- `socket.ts`:沿用 BW store 模式(连接、事件订阅、localStorage 存 `sessionToken` 用于 rejoin)。
- 组件:
  - `Lobby.svelte`:创建/加入房间(房间码)。
  - `Board.svelte`:4×4 棋盘,每格正反双面 + 翻面动画;按视图渲染字母面/反面/高亮选择。
  - `Hud.svelte`:目标数、双方比分、倒计时(环形)、抢答按钮、"对方选择:A F"列表。
  - `GameOver.svelte`:终局浮层——最终比分 + 胜者 + 再来一局。
- 样式:Tailwind v4 + `theme.css` 的 `@theme` token;复用 BW 的 `Button.svelte`/`Chip.svelte`。

### 3.5 关于隐藏信息(本游戏:无)
本游戏**没有 preview 之后需要保密的状态**:`preview` 一次性把整盘反面展示给双方,客户端从那一刻
起就拥有全盘信息。因此**不做**服务器端反面剥离,也**不需要**"未泄露"回归测试——刻意在后续阶段
对客户端隐瞒反面没有实质防御作用。`ClientView` 直接携带整盘 `board`。
- 各阶段"该显示字母面还是反面"纯粹是**客户端按 `phase`/`revealedCells` 渲染**的事:
  preview 显示全部反面;作答时只高亮字母、选满 3 张才翻面(`resolve`);`reveal` 翻开单格。
  这是**游戏体验规则**,由诚实客户端实现;我们不防御被改造的客户端提前显示反面(无实质收益)。

**仍保留的服务器权威(属公平,非保密)**:
- 答案判定、计时(5/10/3 秒)、计分、阶段推进、抢答裁定全部由**服务器**执行。
- 客户端只发**格子索引/抢答**意图;不能伪造"我答对了"、不能绕过 5 秒、不能在非自己回合作答——
  这些都由 reducer 的阶段/归属校验拒绝。

## 4. 测试标准
- `shared/`(TDD 核心):
  - 牌面生成(组成正确、16 格、无重复、A–P)。
  - `generateTarget` 保证可解(返回的目标必有合法三张解);只产正整数。
  - `validateAnswer`:类型顺序、互异、÷ 整除、− 为正、=目标。
  - `reduce` 全流程:preview→buzzing→answering 的正确/错误/超时分支、**强制交替**、
    resolve 翻面、记忆翻牌**循环**、达到 10 分 `finished`、非法动作被拒。
- `server/`:两个 `socket.io-client` 跑完整一局的集成测试(用**假定时器**驱动 5/10/3 秒);
  含**服务器权威性回归**:伪造/非法答案被拒、非自己回合作答被拒、计时/计分以服务器为准
  (§3.5——不再要求"反面未泄露"那条)。
- `client/`:轻量。
- 完成前:`npm test`(全包)+ `npm run check --workspace @fm/client` 全绿。

## 5. 部署契约
沿用 BW:复制并重命名 `Dockerfile`、`docker-compose.yml`、`.dockerignore`、`web/Caddyfile`
(`bw-`→`fm-`);`fm-server` 仅内网(`expose: 3001`),`fm-web` 为 Caddy 服务静态 + 反代
`/socket.io/`;在 `proxy/Caddyfile` 加一行 `flipmath.minyu.me { reverse_proxy fm-web:80 }`;
客户端用 `io()` 同源连接,`CORS_ORIGIN` 可覆盖。完整步骤见 BW `DEPLOY.md`,本游戏附自己的
`DEPLOY.md`。

## 6. 新游戏 checklist(本设计落地用)
- [ ] 仿 BW 搭 `packages/{shared,server,client}` 与各自 package.json/tsconfig
- [ ] `shared`:类型 + 牌面/目标/校验 + reducer,配单元测试(TDD)
- [ ] `server`:rooms + session + 计时层 + socket 事件;带服务器权威性回归测试
- [ ] `client`:Lobby/Board/Hud/GameOver + socket store
- [ ] 复制并重命名 4 个部署文件;`proxy/Caddyfile` 加一行
- [ ] `npm test` + `svelte-check` 全绿
