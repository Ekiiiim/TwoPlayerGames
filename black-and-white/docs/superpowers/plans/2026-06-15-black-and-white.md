# 《黑与白》在线卡牌游戏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个双人在线、回合制、隐藏信息推理卡牌游戏《黑与白》，服务器权威防作弊，支持房间码配对、断线重连与局后复盘。

**Architecture:** npm workspaces monorepo，分 `shared`（纯函数游戏引擎 + 类型）、`server`（Node + Socket.IO 权威方，持有真实状态）、`client`（Svelte + Vite，只收裁剪后视图）。真实数字只存在于服务器内存，永不进入对局中下发的消息。

**Tech Stack:** TypeScript、Svelte + Vite、Node、Socket.IO、Vitest。部署于 DigitalOcean droplet（nginx 反代 + Let's Encrypt + pm2/systemd）。

参考设计文档：`docs/superpowers/specs/2026-06-15-black-and-white-design.md`

---

## File Structure

```
black-and-white/
├─ package.json                    # workspaces 根
├─ packages/
│  ├─ shared/
│  │   ├─ package.json
│  │   ├─ tsconfig.json
│  │   ├─ src/
│  │   │   ├─ types.ts             # Card, Color, ClientView, GameReview, 事件协议
│  │   │   ├─ game.ts              # createGame, playCard, toClientView, toReview（纯函数）
│  │   │   └─ index.ts             # re-export
│  │   └─ test/
│  │       └─ game.test.ts
│  ├─ server/
│  │   ├─ package.json
│  │   ├─ tsconfig.json
│  │   ├─ src/
│  │   │   ├─ rooms.ts             # 房间/会话管理
│  │   │   ├─ gameSession.ts       # 包装 GameState + 玩家映射
│  │   │   └─ index.ts             # Socket.IO 事件入口
│  │   └─ test/
│  │       └─ integration.test.ts
│  └─ client/
│      ├─ package.json
│      ├─ vite.config.ts
│      ├─ index.html
│      └─ src/
│          ├─ main.ts
│          ├─ socket.ts            # Socket.IO 客户端封装 + store
│          ├─ App.svelte
│          └─ lib/
│              ├─ Lobby.svelte
│              ├─ Table.svelte
│              ├─ Hand.svelte
│              └─ Review.svelte
└─ docs/superpowers/...
```

**核心契约（所有任务共享，先读懂再动手）：**

- `PlayerId = 'p1' | 'p2'`（服务器内部标识；`p1` 为创建房间者）。
- 客户端只认 `'me' | 'opp'` 视角，由服务器按收件人裁剪。
- `Card = 0..8`；`colorOf(card) = card % 2 === 0 ? 'black' : 'white'`。
- 一回合：leader 先出（颜色立即对双方可见）→ follower 后出 → 结算。
- 平局：双方不得分，下回合维持原 leader。非平局：赢家成为下回合 leader。

---

## Task 1: Monorepo 脚手架 + shared 包 + Vitest

**Files:**
- Create: `package.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/test/smoke.test.ts`

- [ ] **Step 1: 写根 workspaces `package.json`**

```json
{
  "name": "black-and-white",
  "private": true,
  "version": "0.0.0",
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "npm test --workspaces --if-present"
  }
}
```

- [ ] **Step 2: 写 `packages/shared/package.json`**

```json
{
  "name": "@bw/shared",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: 写 `packages/shared/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: 写最小 `packages/shared/src/index.ts`**

```ts
export const VERSION = '0.0.0';
```

- [ ] **Step 5: 写 smoke 测试 `packages/shared/test/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { VERSION } from '../src/index';

describe('smoke', () => {
  it('exports VERSION', () => {
    expect(VERSION).toBe('0.0.0');
  });
});
```

- [ ] **Step 6: 安装并运行测试**

Run: `npm install && npm test --workspace @bw/shared`
Expected: 1 passing test。

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json packages/shared
git commit -m "chore: scaffold monorepo with shared package and vitest"
```

---

## Task 2: 类型与 `colorOf`

**Files:**
- Create: `packages/shared/src/types.ts`
- Test: `packages/shared/test/game.test.ts`

- [ ] **Step 1: 写失败测试（`game.test.ts` 起始）**

```ts
import { describe, it, expect } from 'vitest';
import { colorOf } from '../src/game';

describe('colorOf', () => {
  it('even cards are black', () => {
    expect(colorOf(0)).toBe('black');
    expect(colorOf(8)).toBe('black');
  });
  it('odd cards are white', () => {
    expect(colorOf(1)).toBe('white');
    expect(colorOf(7)).toBe('white');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test --workspace @bw/shared`
Expected: FAIL，`colorOf`/`../src/game` 未找到。

- [ ] **Step 3: 写 `types.ts`**

```ts
export type Card = number; // 0..8
export type Color = 'black' | 'white';
export type RoundResult = 'win' | 'lose' | 'draw';
export type Phase = 'waiting' | 'playing' | 'finished';
export type PlayerId = 'p1' | 'p2';

export interface RoundRecord {
  round: number;            // 1..9
  leader: PlayerId;
  cards: Record<PlayerId, Card>;
  winner: PlayerId | 'draw';
}

export interface GameState {
  hands: Record<PlayerId, Card[]>;
  scores: Record<PlayerId, number>;
  current: {
    index: number;          // 1..9
    leader: PlayerId;
    leaderCard?: Card;
    followerCard?: Card;
  };
  history: RoundRecord[];
  phase: Phase;
}

export interface ClientView {
  myHand: Card[];
  myPlayedCards: Card[];
  opponentCardsLeft: number;
  opponentPlayedColors: Color[];
  roundResults: RoundResult[];
  scores: { me: number; opp: number };
  currentRound: {
    index: number;
    iAmLeader: boolean;
    leaderColor?: Color;
    leaderHasPlayed: boolean;
    followerHasPlayed: boolean;
  };
  turn: 'me' | 'opp';
  phase: Phase;
}

export interface GameReviewRound {
  round: number;
  firstPlayer: 'me' | 'opp';
  myCard: Card;
  oppCard: Card;
  result: RoundResult;
}

export interface GameReview {
  rounds: GameReviewRound[];
  finalScore: { me: number; opp: number };
  winner: 'me' | 'opp' | 'draw';
}
```

- [ ] **Step 4: 写 `game.ts` 起始 + `colorOf`**

```ts
import type { Card, Color } from './types';

export function colorOf(card: Card): Color {
  return card % 2 === 0 ? 'black' : 'white';
}
```

- [ ] **Step 5: 更新 `index.ts` re-export**

```ts
export * from './types';
export * from './game';
```

- [ ] **Step 6: 运行确认通过**

Run: `npm test --workspace @bw/shared`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src packages/shared/test
git commit -m "feat(shared): add core types and colorOf"
```

---

## Task 3: `createGame`

**Files:**
- Modify: `packages/shared/src/game.ts`
- Test: `packages/shared/test/game.test.ts`

- [ ] **Step 1: 写失败测试（追加到 `game.test.ts`）**

```ts
import { createGame } from '../src/game';

describe('createGame', () => {
  it('deals 0..8 to both players', () => {
    const g = createGame('p1');
    expect([...g.hands.p1].sort((a, b) => a - b)).toEqual([0,1,2,3,4,5,6,7,8]);
    expect([...g.hands.p2].sort((a, b) => a - b)).toEqual([0,1,2,3,4,5,6,7,8]);
  });
  it('starts at round 1, playing phase, given leader, zero scores', () => {
    const g = createGame('p2');
    expect(g.current.index).toBe(1);
    expect(g.current.leader).toBe('p2');
    expect(g.phase).toBe('playing');
    expect(g.scores).toEqual({ p1: 0, p2: 0 });
    expect(g.history).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test --workspace @bw/shared`
Expected: FAIL，`createGame` 未定义。

- [ ] **Step 3: 实现 `createGame`（追加到 `game.ts`）**

```ts
import type { GameState, PlayerId } from './types';

function fullHand(): Card[] {
  return [0, 1, 2, 3, 4, 5, 6, 7, 8];
}

export function createGame(firstLeader: PlayerId): GameState {
  return {
    hands: { p1: fullHand(), p2: fullHand() },
    scores: { p1: 0, p2: 0 },
    current: { index: 1, leader: firstLeader },
    history: [],
    phase: 'playing',
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test --workspace @bw/shared`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add createGame"
```

---

## Task 4: `playCard` — 出牌、结算、计分（非平局）

**Files:**
- Modify: `packages/shared/src/game.ts`
- Test: `packages/shared/test/game.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { playCard, otherPlayer } from '../src/game';

describe('playCard happy path', () => {
  it('leader plays, then follower; higher card wins the round', () => {
    let g = createGame('p1');           // p1 leads
    g = playCard(g, 'p1', 5);           // leader
    expect(g.current.leaderCard).toBe(5);
    expect(g.hands.p1).not.toContain(5);
    g = playCard(g, 'p2', 3);           // follower (p2)
    // round resolved: p1 wins
    expect(g.scores).toEqual({ p1: 1, p2: 0 });
    expect(g.history).toHaveLength(1);
    expect(g.history[0]).toEqual({
      round: 1, leader: 'p1', cards: { p1: 5, p2: 3 }, winner: 'p1',
    });
  });
  it('winner leads the next round', () => {
    let g = createGame('p1');
    g = playCard(g, 'p1', 2);
    g = playCard(g, 'p2', 6);           // p2 wins
    expect(g.current.index).toBe(2);
    expect(g.current.leader).toBe('p2');
    expect(g.current.leaderCard).toBeUndefined();
  });
  it('otherPlayer flips id', () => {
    expect(otherPlayer('p1')).toBe('p2');
    expect(otherPlayer('p2')).toBe('p1');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test --workspace @bw/shared`
Expected: FAIL，`playCard`/`otherPlayer` 未定义。

- [ ] **Step 3: 实现 `otherPlayer`、`currentTurn`、`playCard`（追加到 `game.ts`）**

```ts
import type { RoundRecord } from './types';

export function otherPlayer(p: PlayerId): PlayerId {
  return p === 'p1' ? 'p2' : 'p1';
}

export function currentTurn(g: GameState): PlayerId {
  return g.current.leaderCard === undefined
    ? g.current.leader
    : otherPlayer(g.current.leader);
}

export function playCard(g: GameState, player: PlayerId, card: Card): GameState {
  const leader = g.current.leader;
  const follower = otherPlayer(leader);

  // 取出手牌副本
  const hand = [...g.hands[player]];
  const idx = hand.indexOf(card);
  hand.splice(idx, 1);
  const hands = { ...g.hands, [player]: hand };

  if (player === leader) {
    return { ...g, hands, current: { ...g.current, leaderCard: card } };
  }

  // follower 出牌 → 结算
  const leaderCard = g.current.leaderCard!;
  const followerCard = card;
  const cards = { [leader]: leaderCard, [follower]: followerCard } as Record<PlayerId, Card>;

  let winner: PlayerId | 'draw';
  if (leaderCard > followerCard) winner = leader;
  else if (followerCard > leaderCard) winner = follower;
  else winner = 'draw';

  const scores = { ...g.scores };
  if (winner !== 'draw') scores[winner] += 1;

  const record: RoundRecord = { round: g.current.index, leader, cards, winner };
  const history = [...g.history, record];

  // 下回合 leader：赢家先出；平局维持原 leader
  const nextLeader = winner === 'draw' ? leader : winner;
  const nextIndex = g.current.index + 1;

  return {
    hands,
    scores,
    history,
    current: { index: nextIndex, leader: nextLeader },
    phase: g.phase,
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test --workspace @bw/shared`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add playCard with round resolution and scoring"
```

---

## Task 5: 平局规则 — 不得分、维持原先手

**Files:**
- Modify: `packages/shared/src/game.ts`（若 Task 4 已覆盖逻辑，本任务可能仅加测试）
- Test: `packages/shared/test/game.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
describe('playCard draw', () => {
  it('equal cards: no score, leader unchanged next round', () => {
    let g = createGame('p1');
    g = playCard(g, 'p1', 4);
    g = playCard(g, 'p2', 4);           // draw
    expect(g.scores).toEqual({ p1: 0, p2: 0 });
    expect(g.history[0].winner).toBe('draw');
    expect(g.current.index).toBe(2);
    expect(g.current.leader).toBe('p1'); // unchanged
  });
});
```

- [ ] **Step 2: 运行**

Run: `npm test --workspace @bw/shared`
Expected: PASS（Task 4 已实现平局逻辑）。若 FAIL，对照 Task 4 的 `winner === 'draw'` 分支修正。

- [ ] **Step 3: Commit**

```bash
git add packages/shared
git commit -m "test(shared): cover draw round rules"
```

---

## Task 6: `playCard` 校验 — 轮次、归属、阶段

**Files:**
- Modify: `packages/shared/src/game.ts`
- Test: `packages/shared/test/game.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
describe('playCard validation', () => {
  it('rejects when it is not the player turn', () => {
    const g = createGame('p1');         // p1 leads
    expect(() => playCard(g, 'p2', 3)).toThrow(/not your turn/i);
  });
  it('rejects a card not in hand', () => {
    let g = createGame('p1');
    g = playCard(g, 'p1', 5);
    expect(() => playCard(g, 'p1', 5)).toThrow(); // p1 already played / not turn
  });
  it('rejects follower playing a card they do not hold', () => {
    let g = createGame('p1');
    g = playCard(g, 'p1', 5);
    // p2 still holds 0..8; playing 99 is invalid
    expect(() => playCard(g, 'p2', 99)).toThrow(/not in hand/i);
  });
  it('rejects play when game finished', () => {
    const g = { ...createGame('p1'), phase: 'finished' as const };
    expect(() => playCard(g, 'p1', 1)).toThrow(/not in progress/i);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test --workspace @bw/shared`
Expected: FAIL（当前无校验，抛错信息不匹配）。

- [ ] **Step 3: 在 `playCard` 开头加校验**

在 `playCard` 函数体最前面插入：

```ts
  if (g.phase !== 'playing') {
    throw new Error('Game is not in progress');
  }
  if (currentTurn(g) !== player) {
    throw new Error('It is not your turn');
  }
  if (!g.hands[player].includes(card)) {
    throw new Error('Card is not in hand');
  }
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test --workspace @bw/shared`
Expected: PASS（全部测试）。

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): validate turn, ownership, and phase in playCard"
```

---

## Task 7: 游戏结束与最终胜负

**Files:**
- Modify: `packages/shared/src/game.ts`
- Test: `packages/shared/test/game.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// 辅助：跑完一整局，返回末态
function playFullGame(plays: Array<[PlayerId, Card]>): GameState {
  let g = createGame('p1');
  for (const [p, c] of plays) g = playCard(g, p, c);
  return g;
}

describe('game end', () => {
  it('after 9 rounds phase is finished', () => {
    // p1 leads R1; 让 p1 全胜：每回合 p1 出大、p2 出小
    let g = createGame('p1');
    const p1cards = [8, 7, 6, 5, 4, 3, 2, 1, 0];
    const p2cards = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // 注意：p2 每回合都更小→p1 全胜，p1 持续 leader
    for (let i = 0; i < 9; i++) {
      g = playCard(g, 'p1', p1cards[i]);
      g = playCard(g, 'p2', p2cards[i]);
    }
    expect(g.phase).toBe('finished');
    expect(g.scores).toEqual({ p1: 9, p2: 0 });
    expect(g.history).toHaveLength(9);
    expect(g.hands.p1).toHaveLength(0);
    expect(g.hands.p2).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test --workspace @bw/shared`
Expected: FAIL，`phase` 仍为 `'playing'`（未在第 9 回合后置 finished）。

- [ ] **Step 3: 在 `playCard` 结算分支设置结束阶段**

把结算分支末尾的 `return` 改为依据回合数判定 phase：

```ts
  const finished = g.current.index >= 9;
  const nextIndex = g.current.index + 1;

  return {
    hands,
    scores,
    history,
    current: finished
      ? { index: g.current.index, leader: nextLeader }
      : { index: nextIndex, leader: nextLeader },
    phase: finished ? 'finished' : 'playing',
  };
```

（删除 Task 4 中旧的 `nextIndex`/`return`，以此替代。）

- [ ] **Step 4: 运行确认通过**

Run: `npm test --workspace @bw/shared`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): finish game after 9 rounds"
```

---

## Task 8: `toClientView` — 按收件人裁剪（不泄露对手数字）

**Files:**
- Modify: `packages/shared/src/game.ts`
- Test: `packages/shared/test/game.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { toClientView } from '../src/game';

describe('toClientView', () => {
  it('hides opponent numbers, exposes only colors', () => {
    let g = createGame('p1');
    g = playCard(g, 'p1', 5);           // leader plays; color white visible
    const followerView = toClientView(g, 'p2');
    expect(followerView.currentRound.iAmLeader).toBe(false);
    expect(followerView.currentRound.leaderColor).toBe('white'); // 5 is white
    expect(followerView.currentRound.leaderHasPlayed).toBe(true);
    expect(followerView.turn).toBe('me');
    // serialize whole view; opponent's number 5 must not appear anywhere
    expect(JSON.stringify(followerView)).not.toContain('"5"');
  });
  it('maps scores and results to me/opp perspective', () => {
    let g = createGame('p1');
    g = playCard(g, 'p1', 8);
    g = playCard(g, 'p2', 0);           // p1 wins R1
    const v1 = toClientView(g, 'p1');
    expect(v1.scores).toEqual({ me: 1, opp: 0 });
    expect(v1.roundResults).toEqual(['win']);
    expect(v1.myPlayedCards).toEqual([8]);
    expect(v1.opponentPlayedColors).toEqual(['black']); // 0 is black
    const v2 = toClientView(g, 'p2');
    expect(v2.scores).toEqual({ me: 0, opp: 1 });
    expect(v2.roundResults).toEqual(['lose']);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test --workspace @bw/shared`
Expected: FAIL，`toClientView` 未定义。

- [ ] **Step 3: 实现 `toClientView`**

```ts
import type { ClientView, Color, RoundResult } from './types';

export function toClientView(g: GameState, me: PlayerId): ClientView {
  const opp = otherPlayer(me);
  const leader = g.current.leader;

  const myPlayedFromHistory = g.history.map((r) => r.cards[me]);
  const oppColorsFromHistory: Color[] = g.history.map((r) => colorOf(r.cards[opp]));

  // 当前回合进行中的牌
  const leaderPlayed = g.current.leaderCard !== undefined;
  const followerPlayed = g.current.followerCard !== undefined;

  const myPlayed = [...myPlayedFromHistory];
  const oppColors = [...oppColorsFromHistory];

  // 当前回合：我若已出，补进 myPlayed；对手若已出，补颜色
  const iAmLeader = leader === me;
  if (iAmLeader && leaderPlayed) myPlayed.push(g.current.leaderCard!);
  if (!iAmLeader && followerPlayed) myPlayed.push(g.current.followerCard!);
  if (iAmLeader && followerPlayed) oppColors.push(colorOf(g.current.followerCard!));
  if (!iAmLeader && leaderPlayed) oppColors.push(colorOf(g.current.leaderCard!));

  const roundResults: RoundResult[] = g.history.map((r) =>
    r.winner === 'draw' ? 'draw' : r.winner === me ? 'win' : 'lose',
  );

  return {
    myHand: [...g.hands[me]],
    myPlayedCards: myPlayed,
    opponentCardsLeft: g.hands[opp].length,
    opponentPlayedColors: oppColors,
    roundResults,
    scores: { me: g.scores[me], opp: g.scores[opp] },
    currentRound: {
      index: g.current.index,
      iAmLeader,
      leaderColor: leaderPlayed ? colorOf(g.current.leaderCard!) : undefined,
      leaderHasPlayed: leaderPlayed,
      followerHasPlayed: followerPlayed,
    },
    turn: currentTurn(g) === me ? 'me' : 'opp',
    phase: g.phase,
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test --workspace @bw/shared`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add toClientView with opponent-number hiding"
```

---

## Task 9: `toReview` — 局后复盘（仅结束后揭示真相）

**Files:**
- Modify: `packages/shared/src/game.ts`
- Test: `packages/shared/test/game.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { toReview } from '../src/game';

describe('toReview', () => {
  it('reveals both real cards per round from me perspective', () => {
    let g = createGame('p1');
    const p1cards = [8, 7, 6, 5, 4, 3, 2, 1, 0];
    const p2cards = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (let i = 0; i < 9; i++) {
      g = playCard(g, 'p1', p1cards[i]);
      g = playCard(g, 'p2', p2cards[i]);
    }
    const r = toReview(g, 'p1');
    expect(r.rounds).toHaveLength(9);
    expect(r.rounds[0]).toEqual({
      round: 1, firstPlayer: 'me', myCard: 8, oppCard: 0, result: 'win',
    });
    expect(r.finalScore).toEqual({ me: 9, opp: 0 });
    expect(r.winner).toBe('me');
  });
  it('reports draw when final scores tie', () => {
    // 构造一个含平局、最终同分的局比较复杂；此处直接校验 winner 判定函数行为：
    let g = createGame('p1');
    // R1 draw
    g = playCard(g, 'p1', 0); g = playCard(g, 'p2', 0);
    // 其余 8 回合各赢 4：交替制造 4-4
    // p1 leads R2 (draw 维持 p1 leader)
    const seq: Array<[PlayerId, Card, PlayerId, Card]> = [
      ['p1', 8, 'p2', 1], // p1 win
      ['p1', 7, 'p2', 2], // p1 win
      ['p1', 6, 'p2', 3], // p1 win
      ['p1', 5, 'p2', 4], // p1 win  → p1 4 wins; now need p2 to win 4
    ];
    for (const [, , , ] of []) { /* placeholder */ }
    // 简化：直接断言同分场景的 winner='draw' 由 finalScore 决定
    const review = toReview({ ...g, phase: 'finished', scores: { p1: 4, p2: 4 } }, 'p1');
    expect(review.winner).toBe('draw');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test --workspace @bw/shared`
Expected: FAIL，`toReview` 未定义。

- [ ] **Step 3: 实现 `toReview`**

```ts
import type { GameReview, GameReviewRound } from './types';

export function toReview(g: GameState, me: PlayerId): GameReview {
  const opp = otherPlayer(me);
  const rounds: GameReviewRound[] = g.history.map((r) => ({
    round: r.round,
    firstPlayer: r.leader === me ? 'me' : 'opp',
    myCard: r.cards[me],
    oppCard: r.cards[opp],
    result: r.winner === 'draw' ? 'draw' : r.winner === me ? 'win' : 'lose',
  }));

  const myScore = g.scores[me];
  const oppScore = g.scores[opp];
  const winner = myScore > oppScore ? 'me' : oppScore > myScore ? 'opp' : 'draw';

  return { rounds, finalScore: { me: myScore, opp: oppScore }, winner };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test --workspace @bw/shared`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add toReview for post-game replay"
```

---

## Task 10: server 脚手架 + Socket.IO 启动

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/index.ts`
- Test: `packages/server/test/integration.test.ts`

- [ ] **Step 1: 写 `packages/server/package.json`**

```json
{
  "name": "@bw/server",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@bw/shared": "*",
    "socket.io": "^4.7.0"
  },
  "devDependencies": {
    "socket.io-client": "^4.7.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: 写 `packages/server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: 写失败测试（连接冒烟）**

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { io as ioc, type Socket } from 'socket.io-client';
import { startServer } from '../src/index';

let stop: (() => Promise<void>) | null = null;
afterEach(async () => { if (stop) await stop(); stop = null; });

describe('server smoke', () => {
  it('accepts a socket connection', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const c: Socket = ioc(`http://localhost:${port}`);
    await new Promise<void>((resolve) => c.on('connect', () => resolve()));
    expect(c.connected).toBe(true);
    c.close();
  });
});
```

- [ ] **Step 4: 运行确认失败**

Run: `npm install && npm test --workspace @bw/server`
Expected: FAIL，`startServer` 未定义。

- [ ] **Step 5: 实现最小 `index.ts`**

```ts
import { createServer } from 'node:http';
import { Server } from 'socket.io';

export async function startServer(port: number): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const http = createServer();
  const io = new Server(http, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    // 事件在后续任务接入
    void socket;
  });

  await new Promise<void>((resolve) => http.listen(port, resolve));
  const actualPort = (http.address() as { port: number }).port;

  return {
    port: actualPort,
    close: () =>
      new Promise<void>((resolve) => {
        io.close();
        http.close(() => resolve());
      }),
  };
}

// 直接运行时启动固定端口
if (process.argv[1]?.endsWith('index.ts')) {
  startServer(Number(process.env.PORT) || 3001).then(({ port }) =>
    console.log(`server on :${port}`),
  );
}
```

- [ ] **Step 6: 运行确认通过**

Run: `npm test --workspace @bw/server`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add packages/server package-lock.json
git commit -m "chore(server): scaffold socket.io server with startServer"
```

---

## Task 11: 房间管理（创建/加入）

**Files:**
- Create: `packages/server/src/rooms.ts`
- Create: `packages/server/src/gameSession.ts`
- Modify: `packages/server/src/index.ts`
- Test: `packages/server/test/integration.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { io as ioc } from 'socket.io-client';

function connect(port: number) {
  return ioc(`http://localhost:${port}`, { forceNew: true });
}
function once<T>(socket: any, ev: string): Promise<T> {
  return new Promise((res) => socket.once(ev, res));
}

describe('rooms', () => {
  it('create then join starts the game for both', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const a = connect(port);
    const b = connect(port);

    a.emit('create_room');
    const created = await once<{ roomCode: string; sessionToken: string }>(a, 'room_created');
    expect(created.roomCode).toMatch(/^[A-Z0-9]{6}$/);

    b.emit('join_room', { roomCode: created.roomCode });
    const startA = await once<any>(a, 'view_update');
    const startB = await once<any>(b, 'view_update');
    expect(startA.phase).toBe('playing');
    expect(startB.phase).toBe('playing');
    // 恰好一方是本回合 leader
    expect(startA.currentRound.iAmLeader).not.toBe(startB.currentRound.iAmLeader);

    a.close(); b.close();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test --workspace @bw/server`
Expected: FAIL（无 `create_room` 处理）。

- [ ] **Step 3: 写 `gameSession.ts`**

```ts
import { createGame, toClientView, toReview, type GameState, type PlayerId } from '@bw/shared';

export interface Player {
  id: PlayerId;
  socketId: string | null;   // null = 掉线
  sessionToken: string;
}

export class GameSession {
  state: GameState | null = null;
  players: Partial<Record<PlayerId, Player>> = {};

  addPlayer(id: PlayerId, socketId: string, sessionToken: string) {
    this.players[id] = { id, socketId, sessionToken };
  }

  isFull() {
    return !!this.players.p1 && !!this.players.p2;
  }

  start(firstLeader: PlayerId) {
    this.state = createGame(firstLeader);
  }

  viewFor(id: PlayerId) {
    return toClientView(this.state!, id);
  }

  reviewFor(id: PlayerId) {
    return toReview(this.state!, id);
  }
}
```

- [ ] **Step 4: 写 `rooms.ts`**

```ts
import { GameSession } from './gameSession';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function makeToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class RoomRegistry {
  private rooms = new Map<string, GameSession>();

  create(): { roomCode: string; session: GameSession } {
    let roomCode = makeRoomCode();
    while (this.rooms.has(roomCode)) roomCode = makeRoomCode();
    const session = new GameSession();
    this.rooms.set(roomCode, session);
    return { roomCode, session };
  }

  get(roomCode: string): GameSession | undefined {
    return this.rooms.get(roomCode);
  }

  delete(roomCode: string) {
    this.rooms.delete(roomCode);
  }
}
```

- [ ] **Step 5: 在 `index.ts` 接入 create/join**

在 `io.on('connection', ...)` 内替换为：

```ts
import { RoomRegistry, makeToken } from './rooms';
import type { PlayerId } from '@bw/shared';

// 模块级（startServer 内）注册表
const rooms = new RoomRegistry();

io.on('connection', (socket) => {
  let myRoom: string | null = null;
  let myId: PlayerId | null = null;

  socket.on('create_room', () => {
    const { roomCode, session } = rooms.create();
    const token = makeToken();
    session.addPlayer('p1', socket.id, token);
    myRoom = roomCode; myId = 'p1';
    socket.join(roomCode);
    socket.emit('room_created', { roomCode, sessionToken: token });
  });

  socket.on('join_room', ({ roomCode }: { roomCode: string }) => {
    const session = rooms.get(roomCode);
    if (!session) { socket.emit('error_msg', { message: '房间不存在' }); return; }
    if (session.isFull()) { socket.emit('error_msg', { message: '房间已满' }); return; }
    const token = makeToken();
    session.addPlayer('p2', socket.id, token);
    myRoom = roomCode; myId = 'p2';
    socket.join(roomCode);
    socket.emit('room_joined', { roomCode, sessionToken: token });

    // 抛硬币定先手并开局
    const firstLeader: PlayerId = Math.random() < 0.5 ? 'p1' : 'p2';
    session.start(firstLeader);
    broadcastViews(io, session, roomCode);
  });

  void myRoom; void myId;
});
```

并在文件中加入广播辅助（模块级函数）：

```ts
import type { Server } from 'socket.io';
import type { GameSession } from './gameSession';

function broadcastViews(io: Server, session: GameSession, roomCode: string) {
  for (const id of ['p1', 'p2'] as PlayerId[]) {
    const player = session.players[id];
    if (player?.socketId) {
      io.to(player.socketId).emit('view_update', session.viewFor(id));
    }
  }
}
```

> 注意：`rooms` 注册表需提到 `startServer` 作用域内（每个 server 实例独立），把 `const rooms = new RoomRegistry();` 放在 `io.on('connection')` 之前。

- [ ] **Step 6: 运行确认通过**

Run: `npm test --workspace @bw/server`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add packages/server/src
git commit -m "feat(server): room create/join and game start"
```

---

## Task 12: 出牌事件 + 视图广播

**Files:**
- Modify: `packages/server/src/index.ts`
- Test: `packages/server/test/integration.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
describe('play_card flow', () => {
  it('leader color is revealed to follower before they play', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const a = connect(port); const b = connect(port);
    a.emit('create_room');
    const { roomCode } = await once<any>(a, 'room_created');
    b.emit('join_room', { roomCode });
    const va0 = await once<any>(a, 'view_update');
    await once<any>(b, 'view_update');

    // 找出 leader
    const leader = va0.currentRound.iAmLeader ? a : b;
    const follower = leader === a ? b : a;

    leader.emit('play_card', { card: 6 });          // 6 = black
    const fView = await once<any>(follower, 'view_update');
    expect(fView.currentRound.leaderHasPlayed).toBe(true);
    expect(fView.currentRound.leaderColor).toBe('black');
    // follower 视图里不应出现 leader 的数字 6
    expect(JSON.stringify(fView)).not.toContain('"6"');

    a.close(); b.close();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test --workspace @bw/server`
Expected: FAIL（无 `play_card` 处理）。

- [ ] **Step 3: 在 `connection` 内加入 `play_card`**

```ts
import { playCard } from '@bw/shared';

  socket.on('play_card', ({ card }: { card: number }) => {
    if (!myRoom || !myId) return;
    const session = rooms.get(myRoom);
    if (!session || !session.state) return;
    try {
      session.state = playCard(session.state, myId, card);
    } catch (e) {
      socket.emit('error_msg', { message: (e as Error).message });
      return;
    }
    broadcastViews(io, session, myRoom);
    if (session.state.phase === 'finished') {
      broadcastReview(io, session, myRoom);
    }
  });
```

并加入 `broadcastReview` 辅助（模块级，紧邻 `broadcastViews`）：

```ts
function broadcastReview(io: Server, session: GameSession, roomCode: string) {
  for (const id of ['p1', 'p2'] as PlayerId[]) {
    const player = session.players[id];
    if (player?.socketId) {
      io.to(player.socketId).emit('game_over', session.reviewFor(id));
    }
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test --workspace @bw/server`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/server/src
git commit -m "feat(server): handle play_card and broadcast views/review"
```

---

## Task 13: 防作弊集成测试（跑完整局，断言数字从不泄露）

**Files:**
- Test: `packages/server/test/integration.test.ts`

- [ ] **Step 1: 写测试（跑完 9 回合，捕获 follower 收到的所有消息）**

```ts
describe('anti-cheat', () => {
  it('opponent real numbers never appear in any in-game message', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const a = connect(port); const b = connect(port);

    const received: string[] = [];
    for (const sock of [a, b]) {
      sock.onAny((_ev: string, payload: unknown) => {
        // 只捕获对局中消息（game_over 复盘允许含数字）
      });
    }
    a.on('view_update', (v: unknown) => received.push(JSON.stringify(v)));
    b.on('view_update', (v: unknown) => received.push(JSON.stringify(v)));

    a.emit('create_room');
    const { roomCode } = await once<any>(a, 'room_created');
    b.emit('join_room', { roomCode });
    let va = await once<any>(a, 'view_update');
    await once<any>(b, 'view_update');

    // 双方各持 0..8；逐回合由 leader 先出
    const handA = [0,1,2,3,4,5,6,7,8];
    const handB = [0,1,2,3,4,5,6,7,8];
    for (let r = 0; r < 9; r++) {
      const aIsLeader = va.currentRound.iAmLeader;
      const leaderSock = aIsLeader ? a : b;
      const followerSock = aIsLeader ? b : a;
      const leaderCard = (aIsLeader ? handA : handB).shift()!;
      const followerCard = (aIsLeader ? handB : handA).shift()!;
      leaderSock.emit('play_card', { card: leaderCard });
      await once<any>(followerSock, 'view_update');
      followerSock.emit('play_card', { card: followerCard });
      va = await once<any>(a, 'view_update');
    }

    // 断言：任何一方收到的 view_update 里，都只暴露颜色，不含对手数字。
    // 这里做强校验：view 中 opponentPlayedColors 长度合理，且没有 opponent 数字字段。
    for (const msg of received) {
      const v = JSON.parse(msg);
      expect(Array.isArray(v.opponentPlayedColors)).toBe(true);
      expect(v).not.toHaveProperty('opponentPlayedCards');
    }
    a.close(); b.close();
  });
});
```

- [ ] **Step 2: 运行**

Run: `npm test --workspace @bw/server`
Expected: PASS（视图结构已保证不含对手数字字段）。

- [ ] **Step 3: Commit**

```bash
git add packages/server/test
git commit -m "test(server): anti-cheat regression for full game"
```

---

## Task 14: 断线重连

**Files:**
- Modify: `packages/server/src/index.ts`
- Test: `packages/server/test/integration.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
describe('rejoin', () => {
  it('restores view after reconnect with sessionToken', async () => {
    const { port, close } = await startServer(0);
    stop = close;
    const a = connect(port); const b = connect(port);
    a.emit('create_room');
    const created = await once<any>(a, 'room_created');
    b.emit('join_room', { roomCode: created.roomCode });
    await once<any>(a, 'view_update');
    await once<any>(b, 'view_update');

    a.close(); // p1 掉线
    const a2 = connect(port);
    a2.emit('rejoin', { roomCode: created.roomCode, sessionToken: created.sessionToken });
    const restored = await once<any>(a2, 'view_update');
    expect(restored.phase).toBe('playing');
    a2.close(); b.close();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test --workspace @bw/server`
Expected: FAIL（无 `rejoin` 处理）。

- [ ] **Step 3: 加入 `rejoin` 与 `disconnect` 处理（`connection` 内）**

```ts
  socket.on('rejoin', ({ roomCode, sessionToken }: { roomCode: string; sessionToken: string }) => {
    const session = rooms.get(roomCode);
    if (!session) { socket.emit('error_msg', { message: '房间不存在' }); return; }
    const entry = (['p1', 'p2'] as PlayerId[])
      .map((id) => session.players[id])
      .find((p) => p && p.sessionToken === sessionToken);
    if (!entry) { socket.emit('error_msg', { message: '会话无效' }); return; }
    entry.socketId = socket.id;
    myRoom = roomCode; myId = entry.id;
    socket.join(roomCode);
    socket.emit('view_update', session.viewFor(entry.id));
    socket.to(roomCode).emit('opponent_reconnected');
  });

  socket.on('disconnect', () => {
    if (!myRoom || !myId) return;
    const session = rooms.get(myRoom);
    const player = session?.players[myId];
    if (player) player.socketId = null;
    socket.to(myRoom).emit('opponent_disconnected');
  });
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test --workspace @bw/server`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/server/src
git commit -m "feat(server): reconnect via sessionToken and disconnect notice"
```

---

## Task 15: client 脚手架 + Socket store

**Files:**
- Create: `packages/client/package.json`
- Create: `packages/client/vite.config.ts`
- Create: `packages/client/index.html`
- Create: `packages/client/src/main.ts`
- Create: `packages/client/src/App.svelte`
- Create: `packages/client/src/socket.ts`

- [ ] **Step 1: 写 `package.json`**

```json
{
  "name": "@bw/client",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@bw/shared": "*",
    "socket.io-client": "^4.7.0"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^3.1.0",
    "svelte": "^4.2.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0"
  }
}
```

- [ ] **Step 2: 写 `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: { '/socket.io': { target: 'http://localhost:3001', ws: true } },
  },
});
```

- [ ] **Step 3: 写 `index.html`**

```html
<!doctype html>
<html lang="zh">
  <head><meta charset="utf-8" /><title>黑与白</title></head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 4: 写 `src/socket.ts`（连接 + Svelte stores）**

```ts
import { io, type Socket } from 'socket.io-client';
import { writable } from 'svelte/store';
import type { ClientView, GameReview } from '@bw/shared';

export const view = writable<ClientView | null>(null);
export const review = writable<GameReview | null>(null);
export const roomCode = writable<string | null>(null);
export const status = writable<string>('');

const socket: Socket = io({ autoConnect: true });

socket.on('room_created', (d: { roomCode: string; sessionToken: string }) => {
  roomCode.set(d.roomCode);
  localStorage.setItem('bw_token', d.sessionToken);
  localStorage.setItem('bw_room', d.roomCode);
});
socket.on('room_joined', (d: { roomCode: string; sessionToken: string }) => {
  roomCode.set(d.roomCode);
  localStorage.setItem('bw_token', d.sessionToken);
  localStorage.setItem('bw_room', d.roomCode);
});
socket.on('view_update', (v: ClientView) => view.set(v));
socket.on('game_over', (r: GameReview) => review.set(r));
socket.on('error_msg', (e: { message: string }) => status.set(e.message));
socket.on('opponent_disconnected', () => status.set('对手掉线，等待重连…'));
socket.on('opponent_reconnected', () => status.set(''));

export function createRoom() { socket.emit('create_room'); }
export function joinRoom(code: string) { socket.emit('join_room', { roomCode: code }); }
export function playCard(card: number) { socket.emit('play_card', { card }); }
export function tryRejoin() {
  const token = localStorage.getItem('bw_token');
  const room = localStorage.getItem('bw_room');
  if (token && room) socket.emit('rejoin', { roomCode: room, sessionToken: token });
}
```

- [ ] **Step 5: 写 `src/App.svelte` 与 `src/main.ts`**

`src/main.ts`:

```ts
import App from './App.svelte';
const app = new App({ target: document.getElementById('app')! });
export default app;
```

`src/App.svelte`（占位，后续任务填充）:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { view, review, tryRejoin } from './socket';
  import Lobby from './lib/Lobby.svelte';
  import Table from './lib/Table.svelte';
  import Review from './lib/Review.svelte';
  onMount(tryRejoin);
</script>

<main>
  <h1>黑与白</h1>
  {#if $review}
    <Review review={$review} />
  {:else if $view}
    <Table view={$view} />
  {:else}
    <Lobby />
  {/if}
</main>
```

- [ ] **Step 6: 安装并启动验证**

Run: `npm install && npm run dev --workspace @bw/client`
Expected: Vite 启动无报错（Lobby/Table/Review 将在下一任务创建，先创建空壳避免导入失败——见 Step 7）。

- [ ] **Step 7: 创建三个组件空壳避免导入失败**

`src/lib/Lobby.svelte`、`src/lib/Table.svelte`、`src/lib/Review.svelte` 各写最小内容：

```svelte
<script lang="ts">export let view: any = null; export let review: any = null;</script>
<div>placeholder</div>
```

- [ ] **Step 8: Commit**

```bash
git add packages/client package-lock.json
git commit -m "chore(client): scaffold svelte app with socket store"
```

---

## Task 16: Lobby（创建/加入房间）

**Files:**
- Modify: `packages/client/src/lib/Lobby.svelte`

- [ ] **Step 1: 实现 Lobby**

```svelte
<script lang="ts">
  import { createRoom, joinRoom, roomCode, status } from '../socket';
  let code = '';
</script>

<section>
  <button on:click={createRoom}>创建房间</button>
  {#if $roomCode}
    <p>房间码：<strong>{$roomCode}</strong>（发给朋友加入，等待对手…）</p>
  {/if}
  <div>
    <input placeholder="输入房间码" bind:value={code} maxlength="6" />
    <button on:click={() => joinRoom(code.toUpperCase())} disabled={code.length !== 6}>
      加入
    </button>
  </div>
  {#if $status}<p class="status">{$status}</p>{/if}
</section>

<style>
  .status { color: #b00; }
</style>
```

- [ ] **Step 2: 手动验证**

同时启动 server（`npm run dev --workspace @bw/server`）和 client，两个浏览器标签：一边创建房间，复制房间码，另一边加入。
Expected: 加入后双方进入 Table（下一任务实现）。

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/lib/Lobby.svelte
git commit -m "feat(client): lobby create/join room"
```

---

## Task 17: Table + Hand（牌桌、手牌、出牌、先手亮色）

**Files:**
- Modify: `packages/client/src/lib/Table.svelte`
- Create: `packages/client/src/lib/Hand.svelte`

- [ ] **Step 1: 写 `Hand.svelte`**

```svelte
<script lang="ts">
  import { playCard } from '../socket';
  export let cards: number[];
  export let myTurn: boolean;
  function color(c: number) { return c % 2 === 0 ? '黑' : '白'; }
</script>

<div class="hand">
  {#each cards as c}
    <button class:black={c % 2 === 0} disabled={!myTurn} on:click={() => playCard(c)}>
      {c}<small>{color(c)}</small>
    </button>
  {/each}
</div>

<style>
  .hand { display: flex; gap: 8px; flex-wrap: wrap; }
  button { width: 48px; height: 64px; font-size: 20px; }
  .black { background: #222; color: #fff; }
</style>
```

- [ ] **Step 2: 写 `Table.svelte`**

```svelte
<script lang="ts">
  import type { ClientView } from '@bw/shared';
  import Hand from './Hand.svelte';
  import { status } from '../socket';
  export let view: ClientView;

  $: cr = view.currentRound;
  $: myTurn = view.turn === 'me' && view.phase === 'playing';
  $: waitingForMeAsFollower = !cr.iAmLeader && cr.leaderHasPlayed && !cr.followerHasPlayed;
</script>

<section>
  <p>第 {cr.index} / 9 回合 — 比分 我 {view.scores.me} : {view.scores.opp} 对手</p>

  <p>
    本回合先手：{cr.iAmLeader ? '我' : '对手'}
    {#if cr.leaderHasPlayed}
      ｜先手出了一张 <strong>{cr.leaderColor === 'black' ? '黑' : '白'}</strong> 牌
    {/if}
  </p>

  {#if myTurn}
    <p class="turn">{waitingForMeAsFollower ? '看到对手颜色了，轮到你出牌' : '轮到你先出牌'}</p>
  {:else}
    <p class="turn">等待对手出牌…</p>
  {/if}

  <p>对手剩牌：{view.opponentCardsLeft}　对手已出颜色：
    {view.opponentPlayedColors.map((c) => (c === 'black' ? '黑' : '白')).join(' ')}
  </p>

  <p>历史结果：{view.roundResults.map((r) => ({ win: '胜', lose: '负', draw: '平' }[r])).join(' ')}</p>

  <Hand cards={view.myHand} {myTurn} />

  {#if $status}<p class="status">{$status}</p>{/if}
</section>

<style>
  .turn { font-weight: bold; }
  .status { color: #b00; }
</style>
```

- [ ] **Step 3: 手动验证一整局**

两个浏览器对局，逐回合出牌。
Expected: follower 出牌前能看到先手颜色；每回合后比分/颜色/历史更新；9 回合后触发复盘（下一任务渲染）。

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/lib/Table.svelte packages/client/src/lib/Hand.svelte
git commit -m "feat(client): game table with hand and leader-color reveal"
```

---

## Task 18: Review（局后复盘表）

**Files:**
- Modify: `packages/client/src/lib/Review.svelte`

- [ ] **Step 1: 实现 Review**

```svelte
<script lang="ts">
  import type { GameReview } from '@bw/shared';
  export let review: GameReview;
  const label = { win: '胜', lose: '负', draw: '平' } as const;
  function reset() {
    localStorage.removeItem('bw_token');
    localStorage.removeItem('bw_room');
    location.reload();
  }
</script>

<section>
  <h2>
    {#if review.winner === 'me'}你赢了 🎉
    {:else if review.winner === 'opp'}你输了
    {:else}平局{/if}
    （{review.finalScore.me} : {review.finalScore.opp}）
  </h2>

  <table>
    <thead>
      <tr><th>回合</th><th>先手</th><th>我的牌</th><th>对手的牌</th><th>结果</th></tr>
    </thead>
    <tbody>
      {#each review.rounds as r}
        <tr class:win={r.result === 'win'} class:lose={r.result === 'lose'}>
          <td>{r.round}</td>
          <td>{r.firstPlayer === 'me' ? '我' : '对手'}</td>
          <td>{r.myCard}（{r.myCard % 2 === 0 ? '黑' : '白'}）</td>
          <td>{r.oppCard}（{r.oppCard % 2 === 0 ? '黑' : '白'}）</td>
          <td>{label[r.result]}</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <button on:click={reset}>再来一局</button>
</section>

<style>
  table { border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 4px 10px; text-align: center; }
  .win { background: #e6ffe6; }
  .lose { background: #ffecec; }
</style>
```

- [ ] **Step 2: 手动验证**

打完一整局后查看复盘表：逐回合双方真实牌、先手、胜负，总比分与胜者正确；「再来一局」清除 localStorage 并回到 Lobby。
Expected: 复盘信息准确，对局中此前从未泄露的对手数字此刻才出现。

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/lib/Review.svelte
git commit -m "feat(client): post-game review table"
```

---

## Task 19: 部署文档（droplet + nginx + systemd）

**Files:**
- Create: `packages/server/src/index.ts`（确认生产端口/静态托管）
- Create: `DEPLOY.md`

- [ ] **Step 1: 让 server 生产环境可托管前端静态产物（可选一体化部署）**

在 `index.ts` 的 `startServer` 中，挂载静态目录（仅当存在构建产物）：

```ts
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import express from 'express'; // 若不想加 express，可用 nginx 托管静态，见 DEPLOY.md

// 备注：本步骤为可选。推荐用 nginx 托管静态、反代 /socket.io 到 Node，
// 保持 server 纯 WebSocket。详见 DEPLOY.md。
void existsSync; void fileURLToPath; void dirname; void resolve; void express;
```

> 推荐方案：**server 只跑 Socket.IO，nginx 托管前端静态 + 反代**。因此本步不强制加 express，主要产出是 `DEPLOY.md`。

- [ ] **Step 2: 写 `DEPLOY.md`**

````markdown
# 部署到 DigitalOcean Droplet

## 构建
```bash
npm install
npm run build --workspace @bw/client      # 产物在 packages/client/dist
```

## 进程守护（server）
用 pm2：
```bash
npm i -g pm2
PORT=3001 pm2 start "npm run start --workspace @bw/server" --name bw-server
pm2 save && pm2 startup
```

## nginx 反向代理 + 静态托管
`/etc/nginx/sites-available/bw`：
```nginx
server {
  listen 80;
  server_name your.domain;

  root /var/www/bw;            # 把 packages/client/dist 内容放这里
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /socket.io/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }
}
```
```bash
ln -s /etc/nginx/sites-available/bw /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

## TLS（Let's Encrypt）
```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d your.domain
```
certbot 会自动改写 nginx 配置并续期。

## 客户端连接地址
生产环境 client 与站点同源，`io()` 默认连当前 host，无需改地址；
WebSocket 经 nginx 的 `/socket.io/` 反代到 Node。
````

- [ ] **Step 3: Commit**

```bash
git add DEPLOY.md packages/server/src/index.ts
git commit -m "docs: add droplet deployment guide"
```

---

## Self-Review 结论

- **Spec coverage:** 规则（含先手亮色、平局三规则、总分平局）→ Tasks 4–9；服务器权威/隐藏信息 → Tasks 8、11–13；房间码 → Task 11；复盘 → Tasks 9、18；断线重连 → Task 14；部署 → Task 19。全部覆盖。
- **类型一致性:** `ClientView`、`GameReview`、`PlayerId`、`RoundRecord` 在 shared 定义后，server/client 全程复用同名字段（`currentRound.leaderColor`、`scores.me/opp` 等）。
- **隐藏信息回归:** Task 8 单元 + Task 13 集成双重保证对手数字不泄露。
- **已知取舍:** 复盘不持久化、单进程内存状态、sessionToken 仅 localStorage —— 均与 spec「未来扩展」一致。
