import { io, type Socket } from 'socket.io-client';
import { writable } from 'svelte/store';
import type { ClientView } from '@fm/shared';

export const view = writable<ClientView | null>(null);
export const roomCode = writable<string | null>(null);
export const status = writable<string>('');
export const ended = writable<string | null>(null);

const socket: Socket = io({ autoConnect: true });

// 自动 rejoin 进行中:用于区分"静默重连失败(localStorage 过期)"与真实用户错误。
let rejoining = false;

function clearStoredSession() {
  localStorage.removeItem('fm_token');
  localStorage.removeItem('fm_room');
}

function onRoomAccepted(d: { roomCode: string; sessionToken: string }) {
  rejoining = false;
  status.set('');
  roomCode.set(d.roomCode);
  localStorage.setItem('fm_token', d.sessionToken);
  localStorage.setItem('fm_room', d.roomCode);
}
socket.on('room_created', onRoomAccepted);
socket.on('room_joined', onRoomAccepted);

socket.on('view_update', (v: ClientView) => {
  rejoining = false;
  view.set(v);
  if (v.phase !== 'finished') ended.set(null);
});

socket.on('error_msg', (e: { message: string }) => {
  if (rejoining) {
    rejoining = false;
    clearStoredSession();
    roomCode.set(null);
    status.set('');
    return;
  }
  status.set(e.message);
});

socket.on('opponent_disconnected', () => status.set('对手掉线，等待重连…'));
socket.on('opponent_reconnected', () => status.set(''));
socket.on('opponent_left', () => ended.set('对手已退出本局，你获胜 🎉'));

export function createRoom(): void {
  socket.emit('create_room');
}
export function joinRoom(code: string): void {
  socket.emit('join_room', { roomCode: code });
}
export function buzz(): void {
  socket.emit('buzz');
}
export function ready(): void {
  socket.emit('ready');
}
export function selectCell(index: number): void {
  socket.emit('select_cell', { index });
}
export function rematch(): void {
  socket.emit('rematch');
}
export function tryRejoin(): void {
  const token = localStorage.getItem('fm_token');
  const room = localStorage.getItem('fm_room');
  if (token && room) {
    rejoining = true;
    socket.emit('rejoin', { roomCode: room, sessionToken: token });
  }
}
export function leaveRoom(): void {
  socket.emit('leave_room');
  clearStoredSession();
  view.set(null);
  roomCode.set(null);
  ended.set(null);
  status.set('');
}
