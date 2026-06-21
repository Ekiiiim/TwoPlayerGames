import { io, type Socket } from 'socket.io-client';
import { writable } from 'svelte/store';
import { UI } from '@fm/shared';
import type { ClientView } from '@fm/shared';
import { backText } from './lib/cellFace';

export const view = writable<ClientView | null>(null);
export const roomCode = writable<string | null>(null);
export const status = writable<string>('');
export const ended = writable<string | null>(null);
// 回合结果小提示(toast),由 view_update 在有人答对时设置,UI.resultPopupMs 后自动清空。
export const roundResult = writable<string | null>(null);
let prevPhase: string | null = null;
let resultTimer: ReturnType<typeof setTimeout> | undefined;

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
  // 回合结束(有人答对)→ 弹出自动消失的结果提示。只在刚进入 resolve 且答对时触发一次。
  if (v.phase === 'resolve' && prevPhase !== 'resolve' && v.lastResolve?.correct) {
    const [ca, cop, cb] = v.lastResolve.cells.map((i) => v.board[i]);
    const who = v.active === 'me' ? '你答对了' : '对方答对了';
    const eq = ca && cop && cb ? `${backText(ca)} ${backText(cop)} ${backText(cb)} = ${v.target}` : '';
    roundResult.set(eq ? `${who}　${eq}` : who);
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => roundResult.set(null), UI.resultPopupMs);
  }
  prevPhase = v.phase;
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
  roundResult.set(null);
  clearTimeout(resultTimer);
}
