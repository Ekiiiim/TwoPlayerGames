import { randomBytes } from "node:crypto";
import { GameSession } from "./gameSession";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeRoomCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++)
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

// Item 6: Use crypto.randomBytes instead of Math.random for tokens
export function makeToken(): string {
  return randomBytes(16).toString("hex");
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

  delete(roomCode: string): void {
    this.rooms.delete(roomCode);
  }

  // Remove rooms that have been fully empty (no connected sockets) for longer
  // than ttlMs. Returns the codes removed. Called periodically by the server.
  sweep(ttlMs: number, now = Date.now()): string[] {
    const removed: string[] = [];
    for (const [code, session] of this.rooms) {
      if (session.isSweepable(ttlMs, now)) {
        this.rooms.delete(code);
        removed.push(code);
      }
    }
    return removed;
  }
}
