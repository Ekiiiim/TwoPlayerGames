import { createGame, reduce, toClientView, DURATIONS } from "@fm/shared";
import type {
  Action,
  ClientView,
  Durations,
  GameState,
  Phase,
  PlayerId,
} from "@fm/shared";
import { PresenceSession } from "@tpg/server";

// 每个计时阶段到点后要注入的 action。buzzing/finished/waiting 无 deadline,不在此表。
const TIMEOUT_ACTION: Partial<Record<Phase, Action>> = {
  preview: { type: "PREVIEW_DONE" },
  countdown: { type: "COUNTDOWN_DONE" },
  answering: { type: "ANSWER_TIMEOUT" },
  resolve: { type: "RESOLVE_DONE" },
  reveal: { type: "REVEAL_DONE" },
};

export class GameSession extends PresenceSession<GameState, ClientView> {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private durations: Durations = DURATIONS) {
    super();
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

  viewFor(id: PlayerId): ClientView | null {
    return this.state ? toClientView(this.state, id) : null;
  }

  /** 房间销毁前清掉计时器,否则被回收的房间还会继续推进状态。 */
  onDispose(): void {
    this.clearTimer();
  }

  private clearTimer(): void {
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
