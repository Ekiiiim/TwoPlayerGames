# 《黑与白》双人在线卡牌竞技游戏 — 设计文档

日期：2026-06-15
状态：已确认，待实现

## 1. 概述

《黑与白》是一款双人在线、回合制、隐藏信息推理卡牌游戏。

- 每个玩家持有数字 0–8 的九张牌，黑白相间：**双数=黑色（0,2,4,6,8）**，**单数=白色（1,3,5,7）**。
- 共 9 回合，每回合双方各出一张牌（背面朝上，只露颜色）。
- 数字更大的一方赢得该回合，得 1 分。
- 9 回合后分高者获胜。
- 玩家只能看到牌背颜色（奇偶），看不到对方的真实数字 —— 全靠颜色推理。

### 项目目的与约束
- 目的：**学习练手**（全栈、实时通信、服务器权威架构）。
- 配对方式：**房间码**（一人建房得码/链接，发给朋友加入）。
- 不追求大规模随机匹配与长期运营。

## 2. 游戏规则（精确定义）

### 牌组
- 每位玩家一副固定牌：`0,1,2,3,4,5,6,7,8`，共 9 张，唯一值。
- 双方牌组**完全相同**，因此同回合出相同数字（平局）是可能的。
- 颜色：偶数为黑，奇数为白。

### 回合流程（**顺序出牌，先手亮色**）
这是本游戏的核心博弈点：

1. 服务器确定本回合先手，通知其出牌。
2. 先手出一张牌（背面朝上）→ 服务器校验并记录 → **将该牌的颜色（黑/白）广播给双方**。
3. 后手此时**已知先手这张牌的颜色**，再出一张牌 → 服务器校验并记录。
4. 服务器结算本回合，广播胜负结果 + 后手那张牌的颜色（先手据此也得知后手颜色）。
5. 进入下一回合。

> 关键：先手出牌后其**颜色立即对后手可见**，后手带着这条信息决策。机制上必须是顺序出牌，**不是同时出牌**。任何时候都只暴露颜色，绝不暴露数字。

### 先手规则
- 第 1 回合：服务器抛硬币随机决定先手。
- 第 2 回合起：上一回合的**赢家**先出。
- 平局回合后：**维持原先手**（该回合谁先出，下回合仍是谁先出）。

### 计分与胜负
- 单回合：数字大者得 1 分。
- **平局回合（双方数字相同）：双方均不得分**，该回合作废计分（但仍记入复盘历史，结果记为 `draw`）。
- 9 回合后：总分高者获胜。
- **总分相同（仅当出现过平局时可能）：判全局平局（draw）**。

## 3. 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 前端 | **Svelte + Vite + TypeScript** | 样板少、响应式贴合游戏状态、学习收益高、UI 体量小 |
| 实时通信 | **Socket.IO**（client + server） | 内置房间、自动重连、心跳，贴合本场景 |
| 后端 | **Node + TypeScript** | 与前端同语言，可共享游戏规则与类型 |
| 共享逻辑 | monorepo 内 `shared` 包（纯函数） | 规则/类型只写一遍，前后端共用 |
| 状态存储 | **服务器内存（Map）** | 学习场景、对局短暂，无需数据库 |
| 部署 | **DigitalOcean droplet** + nginx + Let's Encrypt TLS + pm2/systemd | 常驻进程支持 WebSocket 长连接无限制 |

> 部署要点：droplet 上 nginx 作反向代理，`/socket.io` 转发到 Node 进程，其余服务 Svelte 静态构建产物；Let's Encrypt 出 TLS；pm2 或 systemd 守护 Node 进程。

## 4. 项目结构（monorepo）

```
black-and-white/
├─ packages/
│  ├─ shared/         # 纯逻辑，无 IO：类型 + 规则引擎
│  │   ├─ types.ts        # Card, GameState, ClientView, GameReview, 事件协议
│  │   └─ game.ts         # 出牌结算、回合推进、胜负判定（纯函数）
│  ├─ server/         # Node + Socket.IO，权威方
│  │   ├─ rooms.ts        # 房间管理（创建/加入/重连）
│  │   ├─ gameSession.ts  # 持有真实 GameState + 回合历史
│  │   └─ index.ts        # Socket.IO 事件入口
│  └─ client/         # Svelte + Vite
│      ├─ socket.ts       # 连接、事件收发
│      └─ components/     # *.svelte：房间、牌桌、手牌、计分、复盘
└─ package.json       # npm workspaces
```

核心原则：`shared/game.ts` 是**纯函数**（给定状态+动作返回新状态）。服务器调用它推进对局；客户端可用同一份逻辑做 UI 预演与合法性校验，但**永远拿不到对方的真实数字**。

## 5. 服务器权威 + 隐藏信息（防作弊核心）

**真实数字只活在服务器内存，永远不进任何发往客户端的消息。**

客户端只收到裁剪后的视图：

```ts
type Color = 'black' | 'white';
type Card = number; // 0..8

type ClientView = {
  myHand: Card[];                 // 自己手牌，明牌
  myPlayedCards: Card[];          // 自己出过的牌
  opponentCardsLeft: number;      // 对手剩牌数
  opponentPlayedColors: Color[];  // 对手已出牌的颜色序列（只有颜色）
  roundResults: ('win' | 'lose' | 'draw')[];
  scores: { me: number; opp: number };
  currentRound: {
    index: number;               // 1..9
    iAmLeader: boolean;          // 本回合我是否先手
    leaderColor?: Color;         // 先手已出牌时，其颜色（后手可见）
    leaderHasPlayed: boolean;
    followerHasPlayed: boolean;
  };
  turn: 'me' | 'opp';
  phase: 'waiting' | 'playing' | 'finished';
};
```

- 对手出的牌，客户端只收到 `color`，**绝不收到数字**。
- 结算在服务器用真实 `GameState` 计算，只广播 `win/lose/draw`。
- 即使开控制台/抓包也拿不到对方的牌，推理空间与线下真人对局一致。

### 服务器端不变量（须有测试保证）
1. 任何下发消息都不含对手真实数字（仅 `finished` 阶段的复盘除外）。
2. 玩家只能在「轮到自己」时出牌；一回合内不能重复出牌。
3. 只能出仍在自己手上的牌。

## 6. 局后复盘

服务器全程持有双方真实牌，复盘即「结束后一次性揭示真相」，无需额外存储隐藏信息。

```ts
type RoundRecord = {
  round: number;                 // 1..9
  firstPlayer: 'me' | 'opp';     // 该回合谁先手
  myCard: Card;
  oppCard: Card;                 // 对手真实牌，仅结束后揭示
  result: 'win' | 'lose' | 'draw';
};

type GameReview = {
  rounds: RoundRecord[];
  finalScore: { me: number; opp: number };
  winner: 'me' | 'opp' | 'draw';
};
```

- 第 9 回合结束 → `phase: 'finished'` → 服务器给双方各推一份各自视角的 `GameReview`。
- 客户端渲染逐回合复盘表（回合 / 谁先手 / 我的牌 / 对手的牌 / 胜负），可高亮关键回合。
- **作用域：仅当局展示，纯内存**。离开房间即销毁，不持久化、无数据库。
- `oppCard` 真实值只在 `finished` 阶段下发，对局进行中绝不泄露。

## 7. 配对与房间（房间码）

- 一名玩家创建房间 → 服务器生成短房间码（如 6 位）→ 返回可分享链接。
- 第二名玩家用码加入 → 房满 → 抛硬币定先手 → 开局。
- 内存中以 `Map<roomCode, GameSession>` 维护。

## 8. 断线重连

- 玩家加入房间时，服务器发 `sessionToken`，client 存入 `localStorage`。
- 断线后 Socket.IO 自动重连传输层 → client 用 `sessionToken` 发 `rejoin`。
- 服务器按 token 找回玩家在房间中的位置，重发当前 `ClientView`。
- 对手断线时，给在线方「对手掉线，等待重连…」提示；超时（默认 60s，可配置）则判在线方胜或作废。
- 注：`sessionToken` 存 localStorage 对学习项目足够；理论上可被冒充，已知且接受。

## 9. 事件协议（Socket.IO，初稿）

客户端 → 服务器：
- `create_room` → `{ roomCode, sessionToken }`
- `join_room { roomCode }` → 成功/失败
- `play_card { card }`
- `rejoin { roomCode, sessionToken }`

服务器 → 客户端：
- `view_update { ClientView }`（每次状态变化广播各自视图）
- `round_result { result, opponentColor }`（含在 view_update 中或单独事件）
- `game_over { GameReview }`
- `opponent_disconnected` / `opponent_reconnected`
- `error { message }`

## 10. 测试策略

- **`shared/game.ts` 纯函数 → 单元测试为主（TDD 核心区）**：出牌结算、平局规则（不得分、维持先手）、先手推进、9 回合结束与总分平局判定。
- **服务器事件层 → 集成测试**：用 Socket.IO 测试客户端模拟两玩家跑完整一局；重点回归 **「对手真实数字从不出现在任何对局中下发消息里，仅暴露颜色」**。
- **前端 → 轻量**：组件渲染 + 关键交互即可，不追求覆盖率。

## 11. 未来扩展（当前不做，YAGNI）

- 随机匹配队列。
- 复盘历史持久化（需引入 SQLite + 玩家身份）。
- 多进程/多机扩展（需 Socket.IO sticky session + Redis adapter）。
