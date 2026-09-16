import { derived, writable } from "svelte/store";
import type { ErrorCode } from "@bw/shared";

export type Lang = "en" | "zh";

/** Anything that can land in the `status` store: a wire error, or a local notice. */
export type StatusCode = ErrorCode | "OPPONENT_DISCONNECTED";
export type EndedCode = "OPPONENT_LEFT";

const STORAGE_KEY = "bw_lang";

// English is the source of truth for the dictionary's shape; `zh` is checked
// against it below, so a missing translation is a type error, not a runtime hole.
const en = {
  title: "Black & White",
  subtitle: "The Genius Season 4 Ep.01",
  lobby: {
    createRoom: "Create Room",
    closeRoom: "Close Room",
    roomCode: "Room Code",
    sharePrompt: "Send it to a friend and wait for them to join…",
    codePlaceholder: "Enter room code",
    join: "Join",
  },
  table: {
    opponent: "Opponent",
    me: "Me",
    opponentInitial: "O",
    meInitial: "M",
    cardsLeft: (n: number) => `${n} left`,
    round: (index: number, total: number) => `Round ${index} / ${total}`,
    decidingLeader: "Deciding who leads…",
    yourLeadTurn: "You lead this round",
    opponentLed: (color: string) => `Opponent led (${color})`,
    yourTurn: "Your turn",
    waitingOpponent: "Waiting for opponent…",
    confirmPlay: "Confirm Play",
    confirmPlayCard: (card: number) => `Confirm Play · ${card}`,
    quit: "Quit Game",
    quitConfirm: "Quit? You forfeit the game and your opponent wins.",
    quitYes: "Confirm Quit",
    cancel: "Cancel",
    black: "Black",
    white: "White",
  },
  review: {
    win: "You win 🎉",
    lose: "You lose",
    draw: "Draw",
    colRound: "Round",
    colLeader: "Led",
    colMyCard: "My Card",
    colOppCard: "Opponent's Card",
    colResult: "Result",
    me: "Me",
    opp: "Opponent",
    rematch: "Rematch",
  },
  chip: { win: "W", lose: "L", draw: "D" },
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
  title: "黑与白",
  subtitle: "《游戏的法则IV》Ep.01",
  lobby: {
    createRoom: "创建房间",
    closeRoom: "解散房间",
    roomCode: "房间码",
    sharePrompt: "发给朋友，等待对手加入…",
    codePlaceholder: "输入房间码",
    join: "加入",
  },
  table: {
    opponent: "对手",
    me: "我",
    opponentInitial: "对",
    meInitial: "我",
    cardsLeft: (n: number) => `剩 ${n} 张`,
    round: (index: number, total: number) => `第 ${index} / ${total} 回合`,
    decidingLeader: "决定先手中…",
    yourLeadTurn: "轮到你先出牌",
    opponentLed: (color: string) => `对方出牌（${color}）`,
    yourTurn: "轮到你出牌",
    waitingOpponent: "等待对手出牌…",
    confirmPlay: "确认出牌",
    confirmPlayCard: (card: number) => `确认出牌 · ${card}`,
    quit: "退出牌局",
    quitConfirm: "确定退出？退出将判负，对手获胜。",
    quitYes: "确认退出",
    cancel: "取消",
    black: "黑",
    white: "白",
  },
  review: {
    win: "你赢了 🎉",
    lose: "你输了",
    draw: "平局",
    colRound: "回合",
    colLeader: "先手",
    colMyCard: "我的牌",
    colOppCard: "对手的牌",
    colResult: "结果",
    me: "我",
    opp: "对手",
    rematch: "再来一局",
  },
  chip: { win: "胜", lose: "负", draw: "平" },
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
