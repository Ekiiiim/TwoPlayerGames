import { writable } from "svelte/store";
import { createRoomSession } from "@tpg/client";
import type { ClientView, GameReview } from "@bw/shared";

export const review = writable<GameReview | null>(null);

const session = createRoomSession<ClientView>({
  storagePrefix: "bw",
  // 新的 playing 视图说明开了新局(rematch),把终局复盘收掉,
  // 双方一起掉回牌桌。ended 由框架清(phase !== "finished")。
  onView: (v) => {
    if (v.phase === "playing") review.set(null);
  },
  onLeave: () => review.set(null),
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

export const playCard = (card: number) => session.emit("play_card", { card });
export const rematch = () => session.emit("rematch");

session.socket.on("game_over", (r: GameReview) => review.set(r));
