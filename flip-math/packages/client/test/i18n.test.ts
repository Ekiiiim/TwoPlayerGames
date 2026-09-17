import { describe, it } from "vitest";
import { assertDictParity } from "@tpg/client";
import { dict } from "../src/i18n";

describe("dictionary", () => {
  it("zh 和 en 形状一致且没有漏翻", () => {
    assertDictParity(dict.en, dict.zh);
  });
});
