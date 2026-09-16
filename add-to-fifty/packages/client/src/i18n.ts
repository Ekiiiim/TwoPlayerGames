import { derived, writable } from "svelte/store";
import type { ErrorCode } from "@add-to-fifty/shared";

export type Lang = "en" | "zh";

/** Anything that can land in the `status` store: a wire error, or a local notice. */
export type StatusCode = ErrorCode | "OPPONENT_DISCONNECTED";
export type EndedCode = "OPPONENT_LEFT";

const STORAGE_KEY = "add2fifty_lang";

// English is the source of truth for the dictionary's shape; `zh` is checked
// against it below, so a missing translation is a type error, not a runtime hole.
const en = {
  title: "Add to Fifty",
  tagline:
    "Take turns playing and drawing. Push the discard pile to 50 or more and you lose.",
  lobby: {
    createRoom: "Create Room",
    closeRoom: "Close Room",
    roomCode: "Room Code",
    waitingOpponent: "Waiting for a second player",
    codePlaceholder: "Room code",
    join: "Join",
  },
  table: {
    room: "Room",
    leave: "Leave",
    opponent: "Opponent",
    me: "Me",
    opponentInitial: "O",
    meInitial: "M",
    thinking: "Thinking",
    waitingYou: "Waiting for you",
    yourTurn: "Your turn",
    waitingOpponent: "Waiting for opponent",
    total: "Total",
    discardPile: "Discard",
    deck: "Deck",
    topDiscard: "Top of discard pile",
    empty: "Empty",
    kingValue: "King value",
    confirmKing: "Play King",
    cancel: "Cancel",
    handLegend: "J=-10 · Q=0 · K=your choice",
  },
  gameOver: {
    finalTotal: "FINAL TOTAL",
    win: "You win",
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
    OPPONENT_LEFT: "Your opponent left the game. You win",
  } satisfies Record<EndedCode, string>,
};

export type Dict = typeof en;

const zh: Dict = {
  // Shipped product name; it was already English-only in the Chinese UI.
  title: "Add to Fifty",
  tagline: "轮流出牌并补牌，谁把弃牌堆累积分推到 50 或以上，谁输。",
  lobby: {
    createRoom: "创建房间",
    closeRoom: "解散房间",
    roomCode: "房间码",
    waitingOpponent: "等待第二位玩家加入",
    codePlaceholder: "房间码",
    join: "加入",
  },
  table: {
    room: "房间",
    leave: "离开",
    opponent: "对手",
    me: "我",
    opponentInitial: "对",
    meInitial: "我",
    thinking: "正在思考",
    waitingYou: "等待你出牌",
    yourTurn: "轮到你出牌",
    waitingOpponent: "等待对手出牌",
    total: "累积分",
    discardPile: "弃牌堆",
    deck: "牌堆",
    topDiscard: "弃牌堆顶牌",
    empty: "空",
    kingValue: "K 的数值",
    confirmKing: "确认出 K",
    cancel: "取消",
    handLegend: "J=-10 · Q=0 · K任选",
  },
  gameOver: {
    finalTotal: "最终累积分",
    win: "你赢了",
    lose: "你输了",
    rematch: "再来一局",
  },
  backToLobby: "返回大厅",
  status: {
    OPPONENT_DISCONNECTED: "对手掉线，等待重连...",
    ALREADY_IN_ROOM: "已在房间中",
    INVALID_REQUEST: "请求无效",
    ROOM_NOT_FOUND: "房间不存在",
    ROOM_FULL: "房间已满",
    INVALID_SESSION: "会话无效",
    INVALID_MOVE: "该操作不合法",
    OPPONENT_GONE: "对手已离开，无法再来一局",
  },
  ended: {
    OPPONENT_LEFT: "对手已退出本局，你获胜",
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
