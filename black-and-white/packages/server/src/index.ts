import { playCard, type PlayerId } from "@bw/shared";
import { createGameServer, isRecord, type ActionCtx } from "@tpg/server";
import { GameSession } from "./gameSession";

export interface ServerOptions {
  // 完全空置的房间保留多久(默认 10 分钟)。
  roomTtlMs?: number;
  // 扫房间隔(默认 60 秒)。
  sweepIntervalMs?: number;
}

function coinFlip(): PlayerId {
  return Math.random() < 0.5 ? "p1" : "p2";
}

/** 开局/再来一局:抛硬币定先手,广播首个视图。 */
function startRound(ctx: ActionCtx<GameSession>): void {
  ctx.session.start(coinFlip());
  ctx.broadcastViews();
}

const makeServer = (options: ServerOptions = {}) =>
  createGameServer<GameSession>({
    createSession: () => new GameSession(),
    onStart: startRound,
    // 只有 playing 才算进行中:waiting 还没开局,finished 已经结算。
    isInProgress: (s) => s.state?.phase === "playing",
    actions: {
      play_card: (ctx, data) => {
        if (!isRecord(data) || typeof data.card !== "number") {
          ctx.fail("INVALID_REQUEST");
          return;
        }
        const session = ctx.session;
        if (!session.state) return;
        try {
          session.state = playCard(session.state, ctx.playerId, data.card);
        } catch {
          ctx.fail("INVALID_MOVE");
          return;
        }
        ctx.broadcastViews();
        if (session.state.phase === "finished") {
          ctx.broadcastPerPlayer("game_over", (id) => session.reviewFor(id));
        }
      },
      rematch: {
        requireBothConnected: true,
        handler: (ctx) => {
          // 只有上一局真的结束了才重开。
          if (ctx.session.state?.phase !== "finished") return;
          startRound(ctx);
        },
      },
    },
    // 掉线重连回到已结束的局:视图之外再补一份复盘,否则终局界面是空的。
    onRejoin: (ctx) => {
      if (ctx.session.state?.phase !== "finished") return;
      const review = ctx.session.reviewFor(ctx.playerId);
      if (review !== null) ctx.socket.emit("game_over", review);
    },
    roomTtlMs: options.roomTtlMs,
    sweepIntervalMs: options.sweepIntervalMs,
  });

export async function startServer(
  port: number,
  options: ServerOptions = {},
): Promise<{ port: number; close: () => Promise<void> }> {
  return makeServer(options)(port);
}

// 直接运行时启动固定端口
if (process.argv[1]?.endsWith("index.ts")) {
  startServer(Number(process.env.PORT) || 3001).then(({ port }) =>
    console.log(`server on :${port}`),
  );
}
