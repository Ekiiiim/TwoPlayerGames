import { describe, expect, it } from "vitest";
import { assertDictParity, dictParityIssues } from "../src/testing";

const en = {
  title: "Game",
  lobby: { join: "Join", cancel: "Cancel" },
  cardsLeft: (n: number) => `${n} left`,
};

const zh = {
  title: "Game",
  lobby: { join: "加入", cancel: "取消" },
  cardsLeft: (n: number) => `剩 ${n} 张`,
};

describe("dictParityIssues", () => {
  it("一致的两份词典没有问题", () => {
    expect(dictParityIssues(en, zh, { sharedByDesign: ["title"] })).toEqual([]);
  });

  it("zh 少一个 key 会被按路径报出来", () => {
    const short = { ...zh, lobby: { join: "加入" } };
    expect(dictParityIssues(en, short as typeof zh)).toContain(
      "zh 缺 key: lobby.cancel",
    );
  });

  it("zh 多一个 key 会被报出来", () => {
    const long = { ...zh, lobby: { ...zh.lobby, extra: "多的" } };
    expect(dictParityIssues(en, long as unknown as typeof zh)).toContain(
      "zh 多出 key: lobby.extra",
    );
  });

  it("zh 原样照抄 en 算漏翻", () => {
    const lazy = { ...zh, lobby: { ...zh.lobby, join: "Join" } };
    expect(dictParityIssues(en, lazy)).toContain("漏翻: lobby.join");
  });

  it("sharedByDesign 里的 key 允许中英同字", () => {
    // title 两边都是 "Game",不列进 sharedByDesign 就该报漏翻。
    expect(dictParityIssues(en, zh)).toContain("漏翻: title");
    expect(dictParityIssues(en, zh, { sharedByDesign: ["title"] })).toEqual([]);
  });

  it("函数条目的 arity 不一致会被报出来", () => {
    const wrongArity = { ...zh, cardsLeft: () => "剩牌" };
    expect(
      dictParityIssues(en, wrongArity as unknown as typeof zh, {
        sharedByDesign: ["title"],
      }),
    ).toContain("arity 不一致: cardsLeft (en 1 / zh 0)");
  });

  it("函数条目 arity 一致时不报,也不当成漏翻", () => {
    const issues = dictParityIssues(en, zh, { sharedByDesign: ["title"] });
    expect(issues.filter((i) => i.includes("cardsLeft"))).toEqual([]);
  });
});

describe("assertDictParity", () => {
  it("有问题时抛错,消息里带上路径", () => {
    const lazy = { ...zh, lobby: { ...zh.lobby, join: "Join" } };
    expect(() =>
      assertDictParity(en, lazy, { sharedByDesign: ["title"] }),
    ).toThrow(/lobby\.join/);
  });

  it("没问题时不抛", () => {
    expect(() =>
      assertDictParity(en, zh, { sharedByDesign: ["title"] }),
    ).not.toThrow();
  });
});
