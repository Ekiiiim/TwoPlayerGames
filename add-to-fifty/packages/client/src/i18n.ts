import { createI18n, sharedLobby, sharedStatus } from "@tpg/client";
import type { EndedCode, Lang, LobbyDict } from "@tpg/client";

// English is the source of truth for the dictionary's shape; `zh` is checked
// against it below, so a missing translation is a type error, not a runtime hole.
const en = {
  title: "Add to Fifty",
  tagline:
    "Take turns playing and drawing. Push the discard pile to 50 or more and you lose.",
  lobby: {
    ...sharedLobby.en,
    waitingOpponent: "Waiting for a second player",
  } satisfies LobbyDict,
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
  status: sharedStatus.en,
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
    ...sharedLobby.zh,
    waitingOpponent: "等待第二位玩家加入",
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
  status: sharedStatus.zh,
  ended: {
    OPPONENT_LEFT: "对手已退出本局，你获胜",
  },
};

export const dict: Record<Lang, Dict> = { en, zh };

export const { lang, t, toggleLang } = createI18n({
  storageKey: "add2fifty_lang",
  dict,
});
