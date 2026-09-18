import type { UserConfig } from "vite";

export interface GameViteOptions {
  /** dev server 端口。不给就用 vite 默认的 5173。 */
  port?: number;
  /** 本地游戏 server 的端口,/socket.io 转发到这里。不给就是 3001。 */
  serverPort?: number;
}

export declare function gameViteConfig(opts?: GameViteOptions): UserConfig;
