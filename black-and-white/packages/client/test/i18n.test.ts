import { describe, expect, it } from "vitest";
import { dict, resolveLang, type Dict } from "../src/i18n";

// Keys that are legitimately the same in both languages. Everything else
// sharing a string means a forgotten translation.
const SHARED_BY_DESIGN: string[] = [];

// Walks both dictionaries in parallel so a missing or mistyped key is reported
// by path rather than as an opaque "objects differ".
function keyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

function read(d: Dict, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc as never)[k], d);
}

describe("resolveLang", () => {
  it("falls back to English for a non-Chinese browser", () => {
    expect(resolveLang(null, "en-US")).toBe("en");
    expect(resolveLang(null, "fr-FR")).toBe("en");
    expect(resolveLang(null, "ja")).toBe("en");
  });

  it("detects Chinese browsers in any region", () => {
    expect(resolveLang(null, "zh-CN")).toBe("zh");
    expect(resolveLang(null, "zh-TW")).toBe("zh");
    expect(resolveLang(null, "ZH")).toBe("zh");
  });

  it("lets a stored choice override detection in both directions", () => {
    expect(resolveLang("en", "zh-CN")).toBe("en");
    expect(resolveLang("zh", "en-US")).toBe("zh");
  });

  it("ignores a corrupted stored value", () => {
    expect(resolveLang("klingon", "en-US")).toBe("en");
    expect(resolveLang("", "zh-CN")).toBe("zh");
  });
});

describe("dictionary", () => {
  it("defines the same keys in both languages", () => {
    expect(keyPaths(dict.zh).sort()).toEqual(keyPaths(dict.en).sort());
  });

  it("translates every key rather than leaving the English text in place", () => {
    const untranslated = keyPaths(dict.en).filter((path) => {
      if (SHARED_BY_DESIGN.includes(path)) return false;
      const [en, zh] = [read(dict.en, path), read(dict.zh, path)];
      return typeof en === "string" && typeof zh === "string" && en === zh;
    });
    expect(untranslated).toEqual([]);
  });
});
