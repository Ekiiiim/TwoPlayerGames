import { describe, expect, it } from "vitest";
import { sharedLobby, sharedStatus, type StatusCode } from "../src/dict";
import { dictParityIssues } from "../src/testing";

// 写死这 8 个 code,而不是从类型推 —— 类型在运行时不存在,而这份清单的作用
// 正是当第二个证人:@tpg/protocol 里的 ErrorCode 加一条,这里就该红。
const CODES: StatusCode[] = [
  "OPPONENT_DISCONNECTED",
  "ALREADY_IN_ROOM",
  "INVALID_REQUEST",
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "INVALID_SESSION",
  "INVALID_MOVE",
  "OPPONENT_GONE",
];

describe("sharedStatus", () => {
  it("每个 StatusCode 中英都有文案", () => {
    for (const code of CODES) {
      expect(sharedStatus.en[code], `en ${code}`).toBeTruthy();
      expect(sharedStatus.zh[code], `zh ${code}`).toBeTruthy();
    }
    expect(Object.keys(sharedStatus.en).sort()).toEqual([...CODES].sort());
  });

  it("中英形状一致且都翻译过", () => {
    expect(dictParityIssues(sharedStatus.en, sharedStatus.zh)).toEqual([]);
  });
});

describe("sharedLobby", () => {
  it("中英形状一致且都翻译过", () => {
    expect(dictParityIssues(sharedLobby.en, sharedLobby.zh)).toEqual([]);
  });
});
