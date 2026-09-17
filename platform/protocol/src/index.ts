// 四个游戏的会话层线协议。玩法事件(play_card、buzz、poker_action 等)和玩法
// 状态(ClientView)不在这里,它们由各游戏的 packages/shared 定义。

export type PlayerId = "p1" | "p2";

// 注解保持 readonly PlayerId[] 而不是 as const 元组:四个游戏原本就是这个类型,
// 收窄成元组会让下游的 .map / .find 推断结果跟着变。
export const PLAYER_IDS: readonly PlayerId[] = ["p1", "p2"];

export type ErrorCode =
  | "ALREADY_IN_ROOM"
  | "INVALID_REQUEST"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "INVALID_SESSION"
  | "INVALID_MOVE"
  | "OPPONENT_GONE";

export interface ErrorMsg {
  code: ErrorCode;
}

/** 建房与加入成功后服务器回的东西,也是 rejoin 要带回来的东西。 */
export interface RoomAccepted {
  roomCode: string;
  sessionToken: string;
}

/** 服务器 -> 客户端,会话层。 */
export interface LobbyServerEvents {
  room_created: (d: RoomAccepted) => void;
  room_joined: (d: RoomAccepted) => void;
  error_msg: (e: ErrorMsg) => void;
  opponent_disconnected: () => void;
  opponent_reconnected: () => void;
  opponent_left: () => void;
}

/** 客户端 -> 服务器,会话层。 */
export interface LobbyClientEvents {
  create_room: () => void;
  join_room: (d: { roomCode: string }) => void;
  rejoin: (d: RoomAccepted) => void;
  leave_room: () => void;
}
