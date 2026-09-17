import { describe, expect, it } from "vitest";
import { get } from "svelte/store";
import { createI18n, resolveLang } from "../src/i18n";

describe("resolveLang", () => {
  it("非中文浏览器回退到英文", () => {
    expect(resolveLang(null, "en-US")).toBe("en");
    expect(resolveLang(null, "fr-FR")).toBe("en");
    expect(resolveLang(null, "ja")).toBe("en");
  });

  it("任何地区的中文浏览器都给中文", () => {
    expect(resolveLang(null, "zh-CN")).toBe("zh");
    expect(resolveLang(null, "zh-TW")).toBe("zh");
    expect(resolveLang(null, "ZH")).toBe("zh");
  });

  it("存下来的选择覆盖检测,两个方向都覆盖", () => {
    expect(resolveLang("en", "zh-CN")).toBe("en");
    expect(resolveLang("zh", "en-US")).toBe("zh");
  });

  it("坏掉的存档值被忽略", () => {
    expect(resolveLang("klingon", "en-US")).toBe("en");
    expect(resolveLang("", "zh-CN")).toBe("zh");
  });
});

describe("createI18n", () => {
  const dict = {
    en: { title: "Game", greet: "Hi" },
    zh: { title: "游戏", greet: "嗨" },
  };

  it("没有 window 的环境里给英文", () => {
    // 这个测试跑在 node 里,没有 window,所以走的是 inBrowser 为假那条路 ——
    // 也是 vite build 做 SSR 预渲染时走的那条。
    const { lang } = createI18n({ storageKey: "x_lang", dict });
    expect(get(lang)).toBe("en");
  });

  it("t 跟着 lang 走", () => {
    const { lang, t } = createI18n({ storageKey: "x_lang", dict });
    expect(get(t).greet).toBe("Hi");
    lang.set("zh");
    expect(get(t).greet).toBe("嗨");
  });
});
