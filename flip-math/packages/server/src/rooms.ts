import { randomBytes } from "node:crypto";
import { DURATIONS } from "@fm/shared";
import type { Durations } from "@fm/shared";
import { GameSession } from "./gameSession";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeRoomCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++)
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function makeToken(): string {
  return randomBytes(16).toString("hex");
}

export class RoomRegistry {
  private rooms = new Map<string, GameSession>();
  constructor(private durations: Durations = DURATIONS) {}

  create(): { roomCode: string; session: GameSession } {
    let roomCode = makeRoomCode();
    while (this.rooms.has(roomCode)) roomCode = makeRoomCode();
    const session = new GameSession(this.durations);
    this.rooms.set(roomCode, session);
    return { roomCode, session };
  }

  get(roomCode: string): GameSession | undefined {
    return this.rooms.get(roomCode);
  }

  delete(roomCode: string): void {
    const s = this.rooms.get(roomCode);
    s?.clearTimer();
    this.rooms.delete(roomCode);
  }

  sweep(ttlMs: number, now = Date.now()): string[] {
    const removed: string[] = [];
    for (const [code, session] of this.rooms) {
      if (session.isSweepable(ttlMs, now)) {
        session.clearTimer();
        this.rooms.delete(code);
        removed.push(code);
      }
    }
    return removed;
  }
}
