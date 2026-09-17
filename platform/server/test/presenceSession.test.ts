import { describe, expect, it } from "vitest";
import { PresenceSession } from "../src/presenceSession";
import type { PlayerId } from "@tpg/protocol";

// 最小实现:连接簿记不关心 state 和 view 的形状,测试也不需要真玩法。
class FakeSession extends PresenceSession<{ n: number }, { n: number }> {
  viewFor(): { n: number } | null {
    return this.state;
  }
}

describe("PresenceSession 的连接簿记", () => {
  it("addPlayer 之后房间不再算空置", () => {
    const s = new FakeSession();
    expect(s.emptySince).toBeNull();
    s.addPlayer("p1", "sock1", "tok1");
    expect(s.players.p1).toEqual({
      id: "p1",
      socketId: "sock1",
      sessionToken: "tok1",
    });
    expect(s.emptySince).toBeNull();
  });

  it("两人到齐才算满", () => {
    const s = new FakeSession();
    expect(s.isFull()).toBe(false);
    s.addPlayer("p1", "sock1", "tok1");
    expect(s.isFull()).toBe(false);
    s.addPlayer("p2", "sock2", "tok2");
    expect(s.isFull()).toBe(true);
  });

  it("bothConnected 要求两人都在且都有 socket", () => {
    const s = new FakeSession();
    s.addPlayer("p1", "sock1", "tok1");
    s.addPlayer("p2", "sock2", "tok2");
    expect(s.bothConnected()).toBe(true);
    s.markDisconnected("p2");
    expect(s.bothConnected()).toBe(false);
    expect(s.anyConnected()).toBe(true);
  });

  it("findByToken 按 token 认人,认不出返回 undefined", () => {
    const s = new FakeSession();
    s.addPlayer("p1", "sock1", "tok1");
    s.addPlayer("p2", "sock2", "tok2");
    expect(s.findByToken("tok2")?.id).toBe("p2");
    expect(s.findByToken("forged")).toBeUndefined();
  });

  it("最后一个人掉线才开始记 emptySince", () => {
    const s = new FakeSession();
    s.addPlayer("p1", "sock1", "tok1");
    s.addPlayer("p2", "sock2", "tok2");
    s.markDisconnected("p1", 1000);
    expect(s.emptySince).toBeNull(); // p2 还在
    s.markDisconnected("p2", 2000);
    expect(s.emptySince).toBe(2000);
  });

  it("重连清掉 emptySince", () => {
    const s = new FakeSession();
    s.addPlayer("p1", "sock1", "tok1");
    s.markDisconnected("p1", 1000);
    expect(s.emptySince).toBe(1000);
    s.markConnected("p1", "sock1b");
    expect(s.emptySince).toBeNull();
    expect(s.players.p1?.socketId).toBe("sock1b");
  });

  it("空置时间够久才可回收", () => {
    const s = new FakeSession();
    s.addPlayer("p1", "sock1", "tok1");
    expect(s.isSweepable(1000, 5000)).toBe(false); // 还有人在线
    s.markDisconnected("p1", 1000);
    expect(s.isSweepable(1000, 1500)).toBe(false); // 只空了 500ms
    expect(s.isSweepable(1000, 2000)).toBe(true);
  });

  it("emptySince 只在第一次归零时记,后续掉线不刷新", () => {
    const s = new FakeSession();
    s.addPlayer("p1", "sock1", "tok1");
    s.markDisconnected("p1", 1000);
    s.markDisconnected("p1", 9000);
    expect(s.emptySince).toBe(1000);
  });

  const ids: PlayerId[] = ["p1", "p2"];
  it.each(ids)("markDisconnected 只清掉指定玩家的 socket: %s", (id) => {
    const s = new FakeSession();
    s.addPlayer("p1", "sock1", "tok1");
    s.addPlayer("p2", "sock2", "tok2");
    s.markDisconnected(id);
    expect(s.players[id]?.socketId).toBeNull();
    const other = id === "p1" ? "p2" : "p1";
    expect(s.players[other]?.socketId).not.toBeNull();
  });
});
