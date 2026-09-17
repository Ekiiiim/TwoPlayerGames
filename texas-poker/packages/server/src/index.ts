import {
  DEFAULT_CONFIG,
  type Card,
  type GameConfig,
  type PlayerAction,
} from "@texas-poker/shared";
import { createGameServer, isRecord } from "@tpg/server";
import { GameSession } from "./gameSession";

export interface ServerOptions {
  deck?: Card[];
  config?: GameConfig;
  roomTtlMs?: number;
  sweepIntervalMs?: number;
}

function parseAction(data: unknown): PlayerAction | null {
  if (!isRecord(data) || typeof data.type !== "string") return null;
  if (data.type === "bet" || data.type === "raise") {
    if (typeof data.amount !== "number") return null;
    return { type: data.type, amount: data.amount };
  }
  if (
    data.type === "fold" ||
    data.type === "check" ||
    data.type === "call" ||
    data.type === "all-in"
  ) {
    return { type: data.type };
  }
  return null;
}

function parseSettings(
  data: unknown,
): Partial<Pick<GameConfig, "enforceMinRaise" | "startingChips">> | null {
  if (!isRecord(data)) return null;
  const settings: Partial<
    Pick<GameConfig, "enforceMinRaise" | "startingChips">
  > = {};
  if ("enforceMinRaise" in data) {
    if (typeof data.enforceMinRaise !== "boolean") return null;
    settings.enforceMinRaise = data.enforceMinRaise;
  }
  if ("startingChips" in data) {
    if (
      typeof data.startingChips !== "number" ||
      !Number.isInteger(data.startingChips) ||
      data.startingChips < 20 ||
      data.startingChips > 100000
    ) {
      return null;
    }
    settings.startingChips = data.startingChips;
  }
  return settings;
}

const makeServer = (options: ServerOptions = {}) => {
  const deckFactory = options.deck ? () => [...options.deck!] : undefined;
  const config = options.config ?? DEFAULT_CONFIG;
  return createGameServer<GameSession>({
    createSession: () => new GameSession(deckFactory, config),
    onStart: (ctx) => {
      ctx.session.start();
      ctx.broadcastViews();
    },
    isInProgress: (s) => s.state !== null && s.state.phase !== "finished",
    actions: {
      poker_action: (ctx, data) => {
        const action = parseAction(data);
        if (!action) {
          ctx.fail("INVALID_REQUEST");
          return;
        }
        try {
          ctx.session.dispatch(ctx.playerId, action);
        } catch {
          ctx.fail("INVALID_MOVE");
          return;
        }
        ctx.broadcastViews();
      },
      next_hand: {
        requireBothConnected: true,
        handler: (ctx) => {
          try {
            ctx.session.nextHand();
          } catch {
            ctx.fail("INVALID_MOVE");
            return;
          }
          ctx.broadcastViews();
        },
      },
      restart_match: {
        requireBothConnected: true,
        handler: (ctx) => {
          try {
            ctx.session.restartMatch();
          } catch {
            ctx.fail("INVALID_MOVE");
            return;
          }
          ctx.broadcastViews();
        },
      },
      // 原实现没给 update_settings 加双方在线的 guard,这里保持一致。
      update_settings: (ctx, data) => {
        const settings = parseSettings(data);
        if (!settings) {
          ctx.fail("INVALID_REQUEST");
          return;
        }
        ctx.session.updateSettings(settings);
        ctx.broadcastViews();
      },
    },
    roomTtlMs: options.roomTtlMs,
    sweepIntervalMs: options.sweepIntervalMs,
  });
};

export async function startServer(
  port: number,
  options: ServerOptions = {},
): Promise<{ port: number; close: () => Promise<void> }> {
  return makeServer(options)(port);
}

if (process.argv[1]?.endsWith("index.ts")) {
  startServer(Number(process.env.PORT) || 3001).then(({ port }) =>
    console.log(`texas-poker server on :${port}`),
  );
}
