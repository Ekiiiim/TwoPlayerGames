import type { Card, PlayerId } from "@add-to-fifty/shared";
import { createGameServer, isRecord } from "@tpg/server";
import { GameSession } from "./gameSession";

export interface ServerOptions {
  deck?: Card[];
  firstPlayer?: PlayerId;
  roomTtlMs?: number;
  sweepIntervalMs?: number;
}

const makeServer = (options: ServerOptions = {}) => {
  // 每局都要一副新牌,所以存工厂而不是数组本身。
  const deckFactory = options.deck ? () => [...options.deck!] : undefined;
  return createGameServer<GameSession>({
    createSession: () =>
      new GameSession(deckFactory, options.firstPlayer ?? "p1"),
    onStart: (ctx) => {
      ctx.session.start();
      ctx.broadcastViews();
    },
    isInProgress: (s) => s.state !== null && s.state.phase !== "finished",
    actions: {
      play_card: (ctx, data) => {
        if (!isRecord(data) || typeof data.cardId !== "string") {
          ctx.fail("INVALID_REQUEST");
          return;
        }
        try {
          ctx.session.play(
            ctx.playerId,
            data.cardId,
            typeof data.kingDelta === "number" ? data.kingDelta : undefined,
          );
        } catch {
          ctx.fail("INVALID_MOVE");
          return;
        }
        ctx.broadcastViews();
      },
      rematch: {
        requireBothConnected: true,
        handler: (ctx) => {
          if (ctx.session.state?.phase !== "finished") return;
          ctx.session.start();
          ctx.broadcastViews();
        },
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
    console.log(`add-to-fifty server on :${port}`),
  );
}
