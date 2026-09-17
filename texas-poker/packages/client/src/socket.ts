import { createRoomSession } from "@tpg/client";
import type { ClientView, GameConfig, PlayerAction } from "@texas-poker/shared";

const session = createRoomSession<ClientView>({ storagePrefix: "texas_poker" });

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

export const act = (action: PlayerAction) =>
  session.emit("poker_action", action);
export const nextHand = () => session.emit("next_hand");
export const restartMatch = () => session.emit("restart_match");
export const updateSettings = (
  settings: Partial<Pick<GameConfig, "enforceMinRaise" | "startingChips">>,
) => session.emit("update_settings", settings);
