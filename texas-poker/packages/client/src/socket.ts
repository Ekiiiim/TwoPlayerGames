import { io, type Socket } from "socket.io-client";
import { writable } from "svelte/store";
import type { ClientView, GameConfig, PlayerAction } from "@texas-poker/shared";

const STORAGE_ROOM = "texas_poker_room";
const STORAGE_TOKEN = "texas_poker_token";

export const view = writable<ClientView | null>(null);
export const roomCode = writable<string | null>(null);
export const status = writable("");
export const ended = writable<string | null>(null);

const socket: Socket = io({ autoConnect: true });
let rejoining = false;

function clearStoredSession(): void {
  localStorage.removeItem(STORAGE_ROOM);
  localStorage.removeItem(STORAGE_TOKEN);
}

function onRoomAccepted(data: {
  roomCode: string;
  sessionToken: string;
}): void {
  rejoining = false;
  status.set("");
  roomCode.set(data.roomCode);
  localStorage.setItem(STORAGE_ROOM, data.roomCode);
  localStorage.setItem(STORAGE_TOKEN, data.sessionToken);
}

socket.on("room_created", onRoomAccepted);
socket.on("room_joined", onRoomAccepted);
socket.on("view_update", (next: ClientView) => {
  rejoining = false;
  status.set("");
  view.set(next);
  if (next.phase !== "finished") ended.set(null);
});
socket.on("error_msg", (error: { message: string }) => {
  if (rejoining) {
    rejoining = false;
    clearStoredSession();
    roomCode.set(null);
    status.set("");
    return;
  }
  status.set(error.message);
});
socket.on("opponent_disconnected", () => status.set("对手掉线，等待重连..."));
socket.on("opponent_reconnected", () => status.set(""));
socket.on("opponent_left", () => ended.set("对手已退出牌局"));

export function createRoom(): void {
  socket.emit("create_room");
}

export function joinRoom(code: string): void {
  socket.emit("join_room", { roomCode: code.trim().toUpperCase() });
}

export function act(action: PlayerAction): void {
  socket.emit("poker_action", action);
}

export function nextHand(): void {
  socket.emit("next_hand");
}

export function restartMatch(): void {
  socket.emit("restart_match");
}

export function updateSettings(
  settings: Partial<Pick<GameConfig, "enforceMinRaise">>,
): void {
  socket.emit("update_settings", settings);
}

export function tryRejoin(): void {
  const room = localStorage.getItem(STORAGE_ROOM);
  const token = localStorage.getItem(STORAGE_TOKEN);
  if (room && token) {
    rejoining = true;
    socket.emit("rejoin", { roomCode: room, sessionToken: token });
  }
}

export function leaveRoom(): void {
  socket.emit("leave_room");
  clearStoredSession();
  view.set(null);
  roomCode.set(null);
  ended.set(null);
  status.set("");
}
