import type { Durations } from "@fm/shared";
import { createGameServer, isRecord } from "@tpg/server";
import { GameSession } from "./gameSession";

export interface ServerOptions {
  roomTtlMs?: number;
  sweepIntervalMs?: number;
  durations?: Durations; // 测试可注入极短时长
}

const makeServer = (options: ServerOptions = {}) =>
  createGameServer<GameSession>({
    createSession: () => new GameSession(options.durations),
    // start() 内部就会广播:状态由计时器推进,每次转移都要推送。
    // 所以这里不调 ctx.broadcastViews(),否则首个视图会发两遍。
    onStart: (ctx) => ctx.session.start(),
    isInProgress: (s) => s.state !== null && s.state.phase !== "finished",
    actions: {
      // 抢答竞态:输的一方在 answering 阶段再 buzz 会被 reduce 拒绝。
      // 静默忽略而不回 error_msg —— 那是正常竞态,不是玩家做错了什么。
      buzz: (ctx) => {
        try {
          ctx.session.dispatch({ type: "BUZZ", player: ctx.playerId });
        } catch {
          /* ignore lost buzz */
        }
      },
      // 非 ready 阶段或重复点击:reduce 幂等或抛错,同样静默忽略。
      ready: (ctx) => {
        try {
          ctx.session.dispatch({ type: "READY", player: ctx.playerId });
        } catch {
          /* ignore stray ready */
        }
      },
      select_cell: (ctx, data) => {
        if (!isRecord(data) || typeof data.index !== "number") {
          ctx.fail("INVALID_REQUEST");
          return;
        }
        try {
          ctx.session.dispatch({
            type: "SELECT",
            player: ctx.playerId,
            cell: data.index,
          });
        } catch {
          ctx.fail("INVALID_MOVE");
        }
      },
      rematch: {
        requireBothConnected: true,
        handler: (ctx) => {
          if (ctx.session.state?.phase !== "finished") return;
          ctx.session.start();
        },
      },
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

if (process.argv[1]?.endsWith("index.ts")) {
  startServer(Number(process.env.PORT) || 3001).then(({ port }) =>
    console.log(`flip-math server on :${port}`),
  );
}
