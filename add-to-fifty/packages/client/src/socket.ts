import { createRoomSession } from "@tpg/client";
import type { ClientView } from "@add-to-fifty/shared";

const session = createRoomSession<ClientView>({ storagePrefix: "add2fifty" });

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

export const playCard = (cardId: string, kingDelta?: number) =>
  session.emit("play_card", { cardId, kingDelta });
export const rematch = () => session.emit("rematch");
