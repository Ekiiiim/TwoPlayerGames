import { randomBytes } from "node:crypto";

// 去掉了 I O 0 1:房间码要靠嘴念给对方。
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeRoomCode(): string {
  let value = "";
  for (let i = 0; i < 6; i += 1) {
    value += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return value;
}

/** 会话 token 走 crypto 而不是 Math.random —— 它是身份凭证。 */
export function makeToken(): string {
  return randomBytes(16).toString("hex");
}

/** RoomRegistry 对 session 的唯一要求。 */
interface Sweepable {
  isSweepable(ttlMs: number, now?: number): boolean;
  onDispose?(): void;
}

export class RoomRegistry<S extends Sweepable> {
  private rooms = new Map<string, S>();

  constructor(private readonly createSession: () => S) {}

  create(): { roomCode: string; session: S } {
    let roomCode = makeRoomCode();
    while (this.rooms.has(roomCode)) roomCode = makeRoomCode();
    const session = this.createSession();
    this.rooms.set(roomCode, session);
    return { roomCode, session };
  }

  get(roomCode: string): S | undefined {
    return this.rooms.get(roomCode);
  }

  delete(roomCode: string): void {
    this.rooms.get(roomCode)?.onDispose?.();
    this.rooms.delete(roomCode);
  }

  /**
   * 回收已经完全空置(双方都没有连接的 socket)超过 ttlMs 的房间,返回删掉的房间码。
   * 服务器定时调用 —— 玩家关标签页不会发 leave_room。
   */
  sweep(ttlMs: number, now = Date.now()): string[] {
    const removed: string[] = [];
    for (const [roomCode, session] of this.rooms) {
      if (session.isSweepable(ttlMs, now)) {
        session.onDispose?.();
        this.rooms.delete(roomCode);
        removed.push(roomCode);
      }
    }
    return removed;
  }
}
