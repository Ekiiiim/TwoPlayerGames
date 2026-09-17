import type { UserConfig } from "vite";

export interface GameViteOptions {
  /** dev server 端口。不给就用 vite 默认的 5173。 */
  port?: number;
}

export declare function gameViteConfig(opts?: GameViteOptions): UserConfig;
