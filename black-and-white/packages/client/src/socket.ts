import { io, type Socket } from 'socket.io-client';
import { writable } from 'svelte/store';
import type { ClientView, GameReview } from '@bw/shared';

export const view = writable<ClientView | null>(null);
export const review = writable<GameReview | null>(null);
export const roomCode = writable<string | null>(null);
export const status = writable<string>('');

const socket: Socket = io({ autoConnect: true });

function onRoomAccepted(d: { roomCode: string; sessionToken: string }) {
  status.set('');
  roomCode.set(d.roomCode);
  localStorage.setItem('bw_token', d.sessionToken);
  localStorage.setItem('bw_room', d.roomCode);
}
socket.on('room_created', onRoomAccepted);
socket.on('room_joined', onRoomAccepted);

socket.on('view_update', (v: ClientView) => view.set(v));
socket.on('game_over', (r: GameReview) => review.set(r));
socket.on('error_msg', (e: { message: string }) => status.set(e.message));
socket.on('opponent_disconnected', () => status.set('对手掉线，等待重连…'));
socket.on('opponent_reconnected', () => status.set(''));

export function createRoom(): void {
  socket.emit('create_room');
}

export function joinRoom(code: string): void {
  socket.emit('join_room', { roomCode: code });
}

export function playCard(card: number): void {
  socket.emit('play_card', { card });
}

export function tryRejoin(): void {
  const token = localStorage.getItem('bw_token');
  const room = localStorage.getItem('bw_room');
  if (token && room) {
    socket.emit('rejoin', { roomCode: room, sessionToken: token });
  }
}
