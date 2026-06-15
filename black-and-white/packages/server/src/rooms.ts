import { GameSession } from './gameSession';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function makeToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class RoomRegistry {
  private rooms = new Map<string, GameSession>();

  create(): { roomCode: string; session: GameSession } {
    let roomCode = makeRoomCode();
    while (this.rooms.has(roomCode)) roomCode = makeRoomCode();
    const session = new GameSession();
    this.rooms.set(roomCode, session);
    return { roomCode, session };
  }

  get(roomCode: string): GameSession | undefined {
    return this.rooms.get(roomCode);
  }

  delete(roomCode: string) {
    this.rooms.delete(roomCode);
  }
}
