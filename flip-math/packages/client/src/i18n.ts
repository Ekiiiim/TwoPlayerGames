import { derived, writable } from "svelte/store";
import type { ErrorCode } from "@fm/shared";

export type Lang = "en" | "zh";

/** Anything that can land in the `status` store: a wire error, or a local notice. */
export type StatusCode = ErrorCode | "OPPONENT_DISCONNECTED";
export type EndedCode = "OPPONENT_LEFT";

const STORAGE_KEY = "fm_lang";

// English is the source of truth for the dictionary's shape; `zh` is checked
// against it below, so a missing translation is a type error, not a runtime hole.
const en = {
  title: "Flip Math",
  lobby: {
    createRoom: "Create Room",
    closeRoom: "Close Room",
    confirmClose: "Confirm Close",
    roomCode: "Room Code",
    waitingOpponent: "Waiting for an opponent…",
    codePlaceholder: "Room code",
    join: "Join",
    cancel: "Cancel",
  },
  hud: {
    me: "Me",
    opponent: "Opponent",
    quit: "Quit",
    quitYes: "Confirm Quit",
    cancel: "Cancel",
    target: "TARGET",
    readyWaiting: "Ready — waiting for your opponent…",
    ready: "Ready",
    readyMark: (done: boolean) => `${done ? "✓" : "○"} You`,
    readyMarkOpp: (done: boolean) => `${done ? "✓" : "○"} Opponent`,
    memorize: "Memorize what's on the back of each tile!",
    buzz: "Buzz In",
    yourAnswer: "Your turn — tap 3 tiles to build the equation",
    opponentAnswering: "Opponent is answering…",
    revealing: "Revealing…",
    memoryHint: "Memory hint…",
  },
  selection: {
    mine: "YOUR PICK",
    opponent: "OPPONENT'S PICK",
    none: "SELECTED",
  },
  round: {
    correctMe: "You got it",
    correctOpp: "Opponent got it",
  },
  gameOver: {
    win: "You win 🎉",
    lose: "You lose",
    rematch: "Rematch",
  },
  backToLobby: "Back to Lobby",
  status: {
    OPPONENT_DISCONNECTED: "Opponent disconnected, waiting to reconnect…",
    ALREADY_IN_ROOM: "You are already in a room",
    INVALID_REQUEST: "Invalid request",
    ROOM_NOT_FOUND: "Room not found",
    ROOM_FULL: "Room is full",
    INVALID_SESSION: "Invalid session",
    INVALID_MOVE: "That move is not allowed",
    OPPONENT_GONE: "Your opponent left, so a rematch is not possible",
  } satisfies Record<StatusCode, string>,
  ended: {
    OPPONENT_LEFT: "Your opponent left the game. You win 🎉",
  } satisfies Record<EndedCode, string>,
};

export type Dict = typeof en;

const zh: Dict = {
  title: "翻牌数式",
  lobby: {
    createRoom: "创建房间",
    closeRoom: "解散房间",
    confirmClose: "确认解散",
    roomCode: "房间号",
    waitingOpponent: "等待对手加入…",
    codePlaceholder: "房间号",
    join: "加入",
    cancel: "取消",
  },
  hud: {
    me: "我",
    opponent: "对手",
    quit: "退出",
    quitYes: "确认退出",
    cancel: "取消",
    target: "目标",
    readyWaiting: "已准备，等待对方…",
    ready: "准备",
    readyMark: (done: boolean) => `${done ? "✓" : "○"} 你`,
    readyMarkOpp: (done: boolean) => `${done ? "✓" : "○"} 对方`,
    memorize: "记住每格的背面！",
    buzz: "抢答",
    yourAnswer: "你来作答（点 3 张组成算式）",
    opponentAnswering: "对方作答中…",
    revealing: "揭晓…",
    memoryHint: "记忆提示中…",
  },
  selection: {
    mine: "你的选择",
    opponent: "对方选择",
    none: "已选",
  },
  round: {
    correctMe: "你答对了",
    correctOpp: "对方答对了",
  },
  gameOver: {
    win: "你赢了 🎉",
    lose: "你输了",
    rematch: "再来一局",
  },
  backToLobby: "返回大厅",
  status: {
    OPPONENT_DISCONNECTED: "对手掉线，等待重连…",
    ALREADY_IN_ROOM: "已在房间中",
    INVALID_REQUEST: "请求无效",
    ROOM_NOT_FOUND: "房间不存在",
    ROOM_FULL: "房间已满",
    INVALID_SESSION: "会话无效",
    INVALID_MOVE: "该操作不合法",
    OPPONENT_GONE: "对手已离开，无法再来一局",
  },
  ended: {
    OPPONENT_LEFT: "对手已退出本局，你获胜 🎉",
  },
};

export const dict: Record<Lang, Dict> = { en, zh };

/**
 * Pure so it is testable without a DOM. English is the fallback: only a browser
 * that actually asks for Chinese gets Chinese.
 */
export function resolveLang(saved: string | null, navigatorLang: string): Lang {
  if (saved === "en" || saved === "zh") return saved;
  return navigatorLang.toLowerCase().startsWith("zh") ? "zh" : "en";
}

const inBrowser = typeof window !== "undefined";

export const lang = writable<Lang>(
  inBrowser
    ? resolveLang(localStorage.getItem(STORAGE_KEY), navigator.language)
    : "en",
);

if (inBrowser) {
  lang.subscribe((l) => {
    document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
    document.title = dict[l].title;
  });
}

/**
 * Persist only on an explicit choice, so browser detection stays in effect
 * until the player actually states a preference.
 */
export function toggleLang(): void {
  lang.update((l) => {
    const next: Lang = l === "zh" ? "en" : "zh";
    localStorage.setItem(STORAGE_KEY, next);
    return next;
  });
}

export const t = derived(lang, ($lang) => dict[$lang]);
