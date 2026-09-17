import { derived, writable, type Readable, type Writable } from "svelte/store";

export type Lang = "en" | "zh";

/**
 * 纯函数,不碰 DOM,所以能直接测。英文是 fallback:
 * 只有浏览器真的要中文才给中文。
 */
export function resolveLang(saved: string | null, navigatorLang: string): Lang {
  if (saved === "en" || saved === "zh") return saved;
  return navigatorLang.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export interface I18nOptions<D> {
  /** localStorage key。必须沿用各游戏现有值(bw_lang / fm_lang / ...)。 */
  storageKey: string;
  dict: Record<Lang, D>;
}

export interface I18n<D> {
  lang: Writable<Lang>;
  t: Readable<D>;
  toggleLang(): void;
}

/** D 要有 title,因为语言一换就要跟着改 document.title。 */
export function createI18n<D extends { title: string }>(
  opts: I18nOptions<D>,
): I18n<D> {
  const inBrowser = typeof window !== "undefined";

  const lang = writable<Lang>(
    inBrowser
      ? resolveLang(localStorage.getItem(opts.storageKey), navigator.language)
      : "en",
  );

  if (inBrowser) {
    lang.subscribe((l) => {
      document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
      document.title = opts.dict[l].title;
    });
  }

  /**
   * 只在玩家明确切换时才写 localStorage —— 在他表态之前,
   * 浏览器语言检测一直有效。
   */
  function toggleLang(): void {
    lang.update((l) => {
      const next: Lang = l === "zh" ? "en" : "zh";
      localStorage.setItem(opts.storageKey, next);
      return next;
    });
  }

  return { lang, t: derived(lang, ($l) => opts.dict[$l]), toggleLang };
}
