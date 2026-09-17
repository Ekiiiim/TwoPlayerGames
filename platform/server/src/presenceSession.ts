import { PLAYER_IDS, type PlayerId } from "@tpg/protocol";

export interface Player {
  id: PlayerId;
  socketId: string | null; // null = 掉线
  sessionToken: string;
}

/**
 * 连接簿记:谁连着、谁掉线了、房间空了多久。不碰任何玩法状态。
 * 各游戏的 GameSession 继承它,自己决定 state 的形状和 viewFor 怎么裁剪。
 */
export abstract class PresenceSession<S, V> {
  state: S | null = null;
  players: Partial<Record<PlayerId, Player>> = {};
  /**
   * 房间最后一次归零连接的时刻,有人在线时为 null。驱动废弃房间回收 ——
   * 关掉标签页不会发 leave_room,没有这个字段房间会永久泄漏。
   */
  emptySince: number | null = null;
  /**
   * 由 createGameServer 在每个接入点赋值。状态由计时器而不是 socket 事件驱动的
   * 游戏用它自己推视图;其余游戏赋了值也不用。
   */
  broadcast: (() => void) | null = null;

  /** 裁剪出某个玩家该看到的视图。没开局时返回 null。 */
  abstract viewFor(id: PlayerId): V | null;

  /** 房间销毁前的清理。有计时器的游戏覆写它。 */
  onDispose?(): void;

  addPlayer(id: PlayerId, socketId: string, sessionToken: string): void {
    this.players[id] = { id, socketId, sessionToken };
    this.emptySince = null;
  }

  isFull(): boolean {
    return !!this.players.p1 && !!this.players.p2;
  }

  anyConnected(): boolean {
    return !!this.players.p1?.socketId || !!this.players.p2?.socketId;
  }

  /** 两人都在座且都有活 socket。重开一局之类的动作要求这个。 */
  bothConnected(): boolean {
    return (
      this.isFull() &&
      !!this.players.p1?.socketId &&
      !!this.players.p2?.socketId
    );
  }

  /** rejoin 时按 token 认人。认不出就是伪造或过期的会话。 */
  findByToken(sessionToken: string): Player | undefined {
    return PLAYER_IDS.map((id) => this.players[id]).find(
      (p) => p?.sessionToken === sessionToken,
    );
  }

  markConnected(id: PlayerId, socketId: string): void {
    const player = this.players[id];
    if (player) player.socketId = socketId;
    this.emptySince = null;
  }

  markDisconnected(id: PlayerId, now = Date.now()): void {
    const player = this.players[id];
    if (player) player.socketId = null;
    if (!this.anyConnected() && this.emptySince === null) this.emptySince = now;
  }

  /** 完全空置满 ttlMs 之后可回收。 */
  isSweepable(ttlMs: number, now = Date.now()): boolean {
    return this.emptySince !== null && now - this.emptySince >= ttlMs;
  }
}
