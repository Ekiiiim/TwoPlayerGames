import { describe, expect, it } from "vitest";
import { RoomRegistry, makeRoomCode, makeToken } from "../src/rooms";

class FakeSession {
  disposed = 0;
  emptySince: number | null = null;
  onDispose(): void {
    this.disposed += 1;
  }
  isSweepable(ttlMs: number, now = Date.now()): boolean {
    return this.emptySince !== null && now - this.emptySince >= ttlMs;
  }
}

describe("makeRoomCode", () => {
  it("6 位,只用不易混淆的字符", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(makeRoomCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it("不含 I O 0 1 —— 房间码要靠嘴念给对方", () => {
    const codes = Array.from({ length: 500 }, makeRoomCode).join("");
    expect(codes).not.toMatch(/[IO01]/);
  });
});

describe("makeToken", () => {
  it("32 个十六进制字符", () => {
    expect(makeToken()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("不重复 —— 它是身份凭证,不是房间码", () => {
    const tokens = new Set(Array.from({ length: 1000 }, makeToken));
    expect(tokens.size).toBe(1000);
  });
});

describe("RoomRegistry", () => {
  it("create 给出房间码和工厂造的 session", () => {
    const reg = new RoomRegistry(() => new FakeSession());
    const { roomCode, session } = reg.create();
    expect(roomCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(reg.get(roomCode)).toBe(session);
  });

  it("房间码不撞", () => {
    const reg = new RoomRegistry(() => new FakeSession());
    const codes = new Set<string>();
    for (let i = 0; i < 300; i += 1) codes.add(reg.create().roomCode);
    expect(codes.size).toBe(300);
  });

  it("get 取不存在的房间返回 undefined", () => {
    const reg = new RoomRegistry(() => new FakeSession());
    expect(reg.get("NOPE22")).toBeUndefined();
  });

  it("delete 会调 onDispose,让带计时器的游戏能清掉它", () => {
    const reg = new RoomRegistry(() => new FakeSession());
    const { roomCode, session } = reg.create();
    reg.delete(roomCode);
    expect(session.disposed).toBe(1);
    expect(reg.get(roomCode)).toBeUndefined();
  });

  it("delete 不存在的房间不抛错", () => {
    const reg = new RoomRegistry(() => new FakeSession());
    expect(() => reg.delete("NOPE22")).not.toThrow();
  });

  it("sweep 只回收空置够久的,并调 onDispose", () => {
    const reg = new RoomRegistry(() => new FakeSession());
    const a = reg.create();
    const b = reg.create();
    a.session.emptySince = 1000;
    b.session.emptySince = 4500;
    const removed = reg.sweep(1000, 5000);
    expect(removed).toEqual([a.roomCode]);
    expect(a.session.disposed).toBe(1);
    expect(reg.get(a.roomCode)).toBeUndefined();
    expect(reg.get(b.roomCode)).toBe(b.session);
    expect(b.session.disposed).toBe(0);
  });

  it("sweep 不动还有人在线的房间", () => {
    const reg = new RoomRegistry(() => new FakeSession());
    const { roomCode } = reg.create(); // emptySince 仍是 null
    expect(reg.sweep(0, 1e12)).toEqual([]);
    expect(reg.get(roomCode)).toBeDefined();
  });
});
