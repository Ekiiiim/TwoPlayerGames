// 给各游戏的 i18n.test.ts 用。刻意不 import vitest —— 这个模块从 src/index.ts
// 导出,而 index 会被 vite 打进生产 bundle。抛普通 Error,任何 runner 都能报。

export interface ParityOptions {
  /** 有意中英同字的 key path。比如 title 是已上线的英文产品名。 */
  sharedByDesign?: string[];
}

// 并行走两棵词典,所以漏掉或打错的 key 是按路径报出来的,不是一句
// "objects differ"。函数是叶子(typeof fn 不是 "object")。
function keyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

function read(dict: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc as never)[k], dict);
}

/**
 * parity check:两份词典的问题清单,空数组表示通过。查三件事 ——
 * key 树一致、带参词条的参数个数一致、zh 没有原样照抄 en。
 */
export function dictParityIssues<D>(
  en: D,
  zh: D,
  opts: ParityOptions = {},
): string[] {
  const shared = new Set(opts.sharedByDesign ?? []);
  const enPaths = keyPaths(en);
  const enSet = new Set(enPaths);
  const zhPaths = keyPaths(zh);
  const zhSet = new Set(zhPaths);
  const issues: string[] = [];

  for (const p of enPaths) if (!zhSet.has(p)) issues.push(`zh 缺 key: ${p}`);
  for (const p of zhPaths) if (!enSet.has(p)) issues.push(`zh 多出 key: ${p}`);

  for (const p of enPaths) {
    if (!zhSet.has(p)) continue;
    const e = read(en, p);
    const z = read(zh, p);
    if (typeof e === "function" && typeof z === "function") {
      if (e.length !== z.length) {
        issues.push(`arity 不一致: ${p} (en ${e.length} / zh ${z.length})`);
      }
      continue;
    }
    if (typeof e === "string" && typeof z === "string" && e === z) {
      if (!shared.has(p)) issues.push(`漏翻: ${p}`);
    }
  }
  return issues;
}

export function assertDictParity<D>(
  en: D,
  zh: D,
  opts: ParityOptions = {},
): void {
  const issues = dictParityIssues(en, zh, opts);
  if (issues.length > 0) {
    throw new Error(`词典中英不一致:\n  ${issues.join("\n  ")}`);
  }
}
