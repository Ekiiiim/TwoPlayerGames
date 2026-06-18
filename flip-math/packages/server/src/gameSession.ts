import { createGame, reduce, toClientView, DURATIONS } from '@fm/shared';
import type { Action, Durations, GameState, Phase, PlayerId } from '@fm/shared';

export interface Player {
  id: PlayerId;
  socketId: string | null; // null = 掉线
  sessionToken: string;
}

// 每个计时阶段到点后要注入的 action。buzzing/finished/waiting 无 deadline,不在此表。
const TIMEOUT_ACTION: Partial<Record<Phase, Action>> = {
  preview: { type: 'PREVIEW_DONE' },
  answering: { type: 'ANSWER_TIMEOUT' },
  resolve: { type: 'RESOLVE_DONE' },
  reveal: { type: 'REVEAL_DONE' },
};

export class GameSession {
  state: GameState | null = null;
  players: Partial<Record<PlayerId, Player>> = {};
  emptySince: number | null = null;
  // 注入的广播回调(由 index.ts 设置),计时器到点也用它推送视图。
  broadcast: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private durations: Durations = DURATIONS) {}

  addPlayer(id: PlayerId, socketId: string, sessionToken: string) {
    this.players[id] = { id, socketId, sessionToken };
    this.emptySince = null;
  }

  isFull() {
    return !!this.players.p1 && !!this.players.p2;
  }
  anyConnected(): boolean {
    return !!this.players.p1?.socketId || !!this.players.p2?.socketId;
  }
  markConnected(id: PlayerId, socketId: string) {
    const p = this.players[id];
    if (p) p.socketId = socketId;
    this.emptySince = null;
  }
  markDisconnected(id: PlayerId, now = Date.now()) {
    const p = this.players[id];
    if (p) p.socketId = null;
    if (!this.anyConnected() && this.emptySince === null) this.emptySince = now;
  }
  isSweepable(ttlMs: number, now = Date.now()): boolean {
    return this.emptySince !== null && now - this.emptySince >= ttlMs;
  }

  // 开局 / 再来一局:重建状态并启动 preview 计时。
  start() {
    this.state = createGame(this.ctx());
    this.afterTransition();
  }

  // 应用一个 action(玩家动作或计时动作)。非法 action 会让 reduce 抛错并向上传播;
  // 此时 state 不变、不广播——由调用方(socket handler)捕获并回 error_msg。
  dispatch(action: Action) {
    if (!this.state) return;
    this.state = reduce(this.state, action, this.ctx());
    this.afterTransition();
  }

  viewFor(id: PlayerId) {
    return this.state ? toClientView(this.state, id) : null;
  }

  clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private ctx() {
    return { now: Date.now(), durations: this.durations };
  }

  private afterTransition() {
    this.scheduleTimer();
    this.broadcast?.();
  }

  private scheduleTimer() {
    this.clearTimer();
    const s = this.state;
    if (!s || s.deadline === null) return;
    const action = TIMEOUT_ACTION[s.phase];
    if (!action) return;
    const ms = Math.max(0, s.deadline - Date.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        this.dispatch(action);
      } catch {
        // 竞态下状态已改变(旧计时器本应被清除);忽略陈旧的计时动作。
      }
    }, ms);
    this.timer.unref?.();
  }
}
