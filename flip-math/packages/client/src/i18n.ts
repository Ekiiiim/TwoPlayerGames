import { createI18n, sharedLobby, sharedStatus } from "@tpg/client";
import type { EndedCode, Lang, LobbyDict } from "@tpg/client";

// English is the source of truth for the dictionary's shape; `zh` is checked
// against it below, so a missing translation is a type error, not a runtime hole.
const en = {
  title: "Flip Math",
  lobby: {
    ...sharedLobby.en,
    waitingOpponent: "Waiting for an opponent…",
  } satisfies LobbyDict,
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
  status: sharedStatus.en,
  ended: {
    OPPONENT_LEFT: "Your opponent left the game. You win 🎉",
  } satisfies Record<EndedCode, string>,
};

export type Dict = typeof en;

const zh: Dict = {
  title: "翻牌数式",
  lobby: {
    ...sharedLobby.zh,
    waitingOpponent: "等待对手加入…",
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
  status: sharedStatus.zh,
  ended: {
    OPPONENT_LEFT: "对手已退出本局，你获胜 🎉",
  },
};

export const dict: Record<Lang, Dict> = { en, zh };

export const { lang, t, toggleLang } = createI18n({
  storageKey: "fm_lang",
  dict,
});
