import { describe, expect, it } from "vitest";
import { PLAYER_IDS } from "../src/index";
import type { ErrorCode, ErrorMsg, PlayerId, RoomAccepted } from "../src/index";

describe("PLAYER_IDS", () => {
  it("正好是两个玩家,顺序固定", () => {
    expect(PLAYER_IDS).toEqual(["p1", "p2"]);
  });
});

describe("类型契约", () => {
  // vitest 走 esbuild,不做类型检查,所以类型契约真正的守卫是 tsc(见 package.json
  // 的 typecheck 脚本)。这里的运行时断言保证这些字面量确实被求值过。
  it("7 个 ErrorCode 都可赋值", () => {
    const codes: ErrorCode[] = [
      "ALREADY_IN_ROOM",
      "INVALID_REQUEST",
      "ROOM_NOT_FOUND",
      "ROOM_FULL",
      "INVALID_SESSION",
      "INVALID_MOVE",
      "OPPONENT_GONE",
    ];
    expect(codes).toHaveLength(7);
  });

  it("ErrorMsg 只带一个 code 字段", () => {
    const msg: ErrorMsg = { code: "ROOM_FULL" };
    expect(Object.keys(msg)).toEqual(["code"]);
  });

  it("RoomAccepted 带房间码和 session token", () => {
    const accepted: RoomAccepted = {
      roomCode: "ABC234",
      sessionToken: "deadbeef",
    };
    expect(Object.keys(accepted).sort()).toEqual(["roomCode", "sessionToken"]);
  });

  it("PlayerId 只有 p1 和 p2", () => {
    const ids: PlayerId[] = ["p1", "p2"];
    expect(ids).toEqual(PLAYER_IDS);
  });
});
