import { createI18n, sharedLobby, sharedStatus } from "@tpg/client";
import type { EndedCode, Lang, LobbyDict } from "@tpg/client";

// English is the source of truth for the dictionary's shape; `zh` is checked
// against it below, so a missing translation is a type error, not a runtime hole.
const en = {
  title: "Black & White",
  subtitle: "The Genius Season 4 Ep.01",
  lobby: {
    ...sharedLobby.en,
    waitingOpponent: "Send it to a friend and wait for them to join…",
  } satisfies LobbyDict,
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
  status: sharedStatus.en,
  ended: {
    OPPONENT_LEFT: "Your opponent left the game. You win 🎉",
  } satisfies Record<EndedCode, string>,
};

export type Dict = typeof en;

const zh: Dict = {
  title: "黑与白",
  subtitle: "《游戏的法则IV》Ep.01",
  lobby: {
    ...sharedLobby.zh,
    waitingOpponent: "发给朋友，等待对手加入…",
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
  status: sharedStatus.zh,
  ended: {
    OPPONENT_LEFT: "对手已退出本局，你获胜 🎉",
  },
};

export const dict: Record<Lang, Dict> = { en, zh };

export const { lang, t, toggleLang } = createI18n({
  storageKey: "bw_lang",
  dict,
});
