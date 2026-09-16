import { io, type Socket } from "socket.io-client";
import { writable } from "svelte/store";
import type { ClientView, ErrorMsg } from "@add-to-fifty/shared";
import type { EndedCode, StatusCode } from "./i18n";

const STORAGE_ROOM = "add2fifty_room";
const STORAGE_TOKEN = "add2fifty_token";

export const view = writable<ClientView | null>(null);
export const roomCode = writable<string | null>(null);
export const status = writable<StatusCode | null>(null);
export const ended = writable<EndedCode | null>(null);

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
  status.set(null);
  roomCode.set(data.roomCode);
  localStorage.setItem(STORAGE_ROOM, data.roomCode);
  localStorage.setItem(STORAGE_TOKEN, data.sessionToken);
}

socket.on("room_created", onRoomAccepted);
socket.on("room_joined", onRoomAccepted);
socket.on("view_update", (next: ClientView) => {
  rejoining = false;
  view.set(next);
  if (next.phase !== "finished") ended.set(null);
});
socket.on("error_msg", (error: ErrorMsg) => {
  if (rejoining) {
    rejoining = false;
    clearStoredSession();
    roomCode.set(null);
    status.set(null);
    return;
  }
  status.set(error.code);
});
socket.on("opponent_disconnected", () => status.set("OPPONENT_DISCONNECTED"));
socket.on("opponent_reconnected", () => status.set(null));
socket.on("opponent_left", () => ended.set("OPPONENT_LEFT"));

export function createRoom(): void {
  socket.emit("create_room");
}

export function joinRoom(code: string): void {
  socket.emit("join_room", { roomCode: code.trim().toUpperCase() });
}

export function playCard(cardId: string, kingDelta?: number): void {
  socket.emit("play_card", { cardId, kingDelta });
}

export function rematch(): void {
  socket.emit("rematch");
}

export function tryRejoin(): void {
  const token = localStorage.getItem(STORAGE_TOKEN);
  const room = localStorage.getItem(STORAGE_ROOM);
  if (token && room) {
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
  status.set(null);
}
