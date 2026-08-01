import { randomBytes } from "node:crypto";
import {
  DEFAULT_CONFIG,
  type Card,
  type GameConfig,
} from "@texas-poker/shared";
import { GameSession } from "./gameSession";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeRoomCode(): string {
  let value = "";
  for (let i = 0; i < 6; i += 1) {
    value += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return value;
}

export function makeToken(): string {
  return randomBytes(16).toString("hex");
}

export class RoomRegistry {
  private rooms = new Map<string, GameSession>();

  constructor(
    private readonly makeDeck?: () => Card[],
    private readonly config: GameConfig = DEFAULT_CONFIG,
  ) {}

  create(): { roomCode: string; session: GameSession } {
    let roomCode = makeRoomCode();
    while (this.rooms.has(roomCode)) roomCode = makeRoomCode();
    const session = new GameSession(this.makeDeck, this.config);
    this.rooms.set(roomCode, session);
    return { roomCode, session };
  }

  get(roomCode: string): GameSession | undefined {
    return this.rooms.get(roomCode);
  }

  delete(roomCode: string): void {
    this.rooms.delete(roomCode);
  }

  sweep(ttlMs: number, now = Date.now()): string[] {
    const removed: string[] = [];
    for (const [roomCode, session] of this.rooms) {
      if (session.isSweepable(ttlMs, now)) {
        this.rooms.delete(roomCode);
        removed.push(roomCode);
      }
    }
    return removed;
  }
}
