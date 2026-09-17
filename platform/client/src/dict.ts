import type { ErrorCode } from "@tpg/protocol";
import type { Lang } from "./i18n";

/** 能落进 status store 的东西:线上报错,或本地通知。 */
export type StatusCode = ErrorCode | "OPPONENT_DISCONNECTED";

/** 终局遮罩的原因。目前只有一种:对手中途退出。 */
export type EndedCode = "OPPONENT_LEFT";

/**
 * 阶段 5 的共享 Lobby 组件要读的词条形状。各游戏 dict 的 lobby 必须满足它 ——
 * 组件落地之前就把形状钉住,阶段 5 的 diff 才能只有组件本身。
 */
export interface LobbyDict {
  createRoom: string;
  closeRoom: string;
  confirmClose: string;
  cancel: string;
  roomCode: string;
  codePlaceholder: string;
  join: string;
  /**
   * 等房时那句话。四个游戏说的不是一件事(bw 让玩家把房间码发给朋友,
   * a2f/tp 只是报状态),所以这条不给共享默认值,由各游戏自己提供。
   */
  waitingOpponent: string;
}

/** 这 8 条对应 @tpg/protocol 的 7 个 ErrorCode 加一个本地通知,四个游戏逐字相同。 */
export const sharedStatus: Record<Lang, Record<StatusCode, string>> = {
  en: {
    OPPONENT_DISCONNECTED: "Opponent disconnected, waiting to reconnect…",
    ALREADY_IN_ROOM: "You are already in a room",
    INVALID_REQUEST: "Invalid request",
    ROOM_NOT_FOUND: "Room not found",
    ROOM_FULL: "Room is full",
    INVALID_SESSION: "Invalid session",
    INVALID_MOVE: "That move is not allowed",
    OPPONENT_GONE: "Your opponent left, so a rematch is not possible",
  },
  zh: {
    OPPONENT_DISCONNECTED: "对手掉线，等待重连…",
    ALREADY_IN_ROOM: "已在房间中",
    INVALID_REQUEST: "请求无效",
    ROOM_NOT_FOUND: "房间不存在",
    ROOM_FULL: "房间已满",
    INVALID_SESSION: "会话无效",
    INVALID_MOVE: "该操作不合法",
    OPPONENT_GONE: "对手已离开，无法再来一局",
  },
};

/**
 * 大厅词条里该统一的 7 条。取值依据(四个游戏现状的多数,或唯一一份):
 * - createRoom / closeRoom / roomCode:三家写 "Create Room" / "Close Room" /
 *   "房间码",tp 写 "Create room" / "Dissolve room",fm 的中文写 "房间号" ——
 *   都是随手打出来的分歧,归到多数那份。
 * - confirmClose:只有 fm 有(它是唯一做了两步确认的),用它的。
 * - cancel:四家都是 "Cancel" / "取消"。
 * - codePlaceholder:三家是 "Room code" / "房间码",bw 是 "Enter room code" /
 *   "输入房间码"。取短的 —— 阶段 5 的输入框和 Join 按钮同排,窄屏下长文案会挤;
 *   bw 那个输入框是整宽的,换短的不会出问题。
 */
export const sharedLobby: Record<Lang, Omit<LobbyDict, "waitingOpponent">> = {
  en: {
    createRoom: "Create Room",
    closeRoom: "Close Room",
    confirmClose: "Confirm Close",
    cancel: "Cancel",
    roomCode: "Room Code",
    codePlaceholder: "Room code",
    join: "Join",
  },
  zh: {
    createRoom: "创建房间",
    closeRoom: "解散房间",
    confirmClose: "确认解散",
    cancel: "取消",
    roomCode: "房间码",
    codePlaceholder: "房间码",
    join: "加入",
  },
};
