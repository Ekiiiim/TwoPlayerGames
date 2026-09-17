import { writable } from "svelte/store";
import { createRoomSession } from "@tpg/client";
import { UI } from "@fm/shared";
import type { ClientView } from "@fm/shared";
import { backText } from "./lib/cellFace";

// 回合结果小提示(toast),有人答对时由 onView 置上,UI.resultPopupMs 后自动清空。
// 存结构化数据而非成品文案:玩家中途切语言,提示要跟着变。
export const roundResult = writable<{
  by: "me" | "opp";
  equation: string;
} | null>(null);

let prevPhase: string | null = null;
let resultTimer: ReturnType<typeof setTimeout> | undefined;

const session = createRoomSession<ClientView>({
  storagePrefix: "fm",
  onView: (v) => {
    // 回合结束(有人答对)→ 弹自动消失的结果提示。只在刚进入 resolve
    // 且答对时触发一次。
    if (
      v.phase === "resolve" &&
      prevPhase !== "resolve" &&
      v.lastResolve?.correct
    ) {
      const [ca, cop, cb] = v.lastResolve.cells.map((i) => v.board[i]);
      const equation =
        ca && cop && cb
          ? `${backText(ca)} ${backText(cop)} ${backText(cb)} = ${v.target}`
          : "";
      roundResult.set({ by: v.active === "me" ? "me" : "opp", equation });
      clearTimeout(resultTimer);
      resultTimer = setTimeout(() => roundResult.set(null), UI.resultPopupMs);
    }
    prevPhase = v.phase;
  },
  onLeave: () => {
    roundResult.set(null);
    clearTimeout(resultTimer);
  },
});

export const {
  view,
  roomCode,
  status,
  ended,
  createRoom,
  joinRoom,
  tryRejoin,
  leaveRoom,
} = session;

export const buzz = () => session.emit("buzz");
export const ready = () => session.emit("ready");
export const selectCell = (index: number) =>
  session.emit("select_cell", { index });
export const rematch = () => session.emit("rematch");
