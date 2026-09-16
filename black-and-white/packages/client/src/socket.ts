import { io, type Socket } from "socket.io-client";
import { writable } from "svelte/store";
import type { ClientView, ErrorMsg, GameReview } from "@bw/shared";
import type { EndedCode, StatusCode } from "./i18n";

export const view = writable<ClientView | null>(null);
export const review = writable<GameReview | null>(null);
export const roomCode = writable<string | null>(null);
export const status = writable<StatusCode | null>(null);
export const ended = writable<EndedCode | null>(null);

const socket: Socket = io({ autoConnect: true });

// True while an auto-rejoin (from a stored session) is in flight. Lets us tell a
// failed *silent* rejoin (stale localStorage → ROOM_NOT_FOUND/INVALID_SESSION)
// apart from a real user error, so we drop the dead session instead of greeting
// the player with a scary error on the lobby.
let rejoining = false;

function clearStoredSession() {
  localStorage.removeItem("bw_token");
  localStorage.removeItem("bw_room");
}

function onRoomAccepted(d: { roomCode: string; sessionToken: string }) {
  rejoining = false;
  status.set(null);
  roomCode.set(d.roomCode);
  localStorage.setItem("bw_token", d.sessionToken);
  localStorage.setItem("bw_room", d.roomCode);
}
socket.on("room_created", onRoomAccepted);
socket.on("room_joined", onRoomAccepted);

socket.on("view_update", (v: ClientView) => {
  rejoining = false;
  view.set(v);
  // A fresh playing-phase view means a (new) game is underway — e.g. a rematch.
  // Clear any leftover end-of-game screens so both players drop into the table.
  if (v.phase === "playing") {
    review.set(null);
    ended.set(null);
  }
});
socket.on("game_over", (r: GameReview) => review.set(r));
socket.on("error_msg", (e: ErrorMsg) => {
  // A failed auto-rejoin means the stored session is dead (room gone / server
  // restarted). Drop it silently and show a clean lobby instead of the error.
  if (rejoining) {
    rejoining = false;
    clearStoredSession();
    roomCode.set(null);
    status.set(null);
    return;
  }
  status.set(e.code);
});
socket.on("opponent_disconnected", () => status.set("OPPONENT_DISCONNECTED"));
socket.on("opponent_reconnected", () => status.set(null));
socket.on("opponent_left", () => ended.set("OPPONENT_LEFT"));

export function createRoom(): void {
  socket.emit("create_room");
}

export function joinRoom(code: string): void {
  socket.emit("join_room", { roomCode: code });
}

export function playCard(card: number): void {
  socket.emit("play_card", { card });
}

export function rematch(): void {
  socket.emit("rematch");
}

export function tryRejoin(): void {
  const token = localStorage.getItem("bw_token");
  const room = localStorage.getItem("bw_room");
  if (token && room) {
    rejoining = true;
    socket.emit("rejoin", { roomCode: room, sessionToken: token });
  }
}

export function leaveRoom(): void {
  socket.emit("leave_room");
  localStorage.removeItem("bw_token");
  localStorage.removeItem("bw_room");
  view.set(null);
  review.set(null);
  roomCode.set(null);
  ended.set(null);
  status.set(null);
}
