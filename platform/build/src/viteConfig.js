// 这个文件是 JS 不是 TS,而且是有意的:vite 加载 vite.config.ts 时用 esbuild
// 打包它,但把 bare import(这里就是 @tpg/build)留成 external,于是 node 直接
// import() 到源文件。node 不认 .ts,会报 ERR_UNKNOWN_FILE_EXTENSION。
// 类型由旁边的 viteConfig.d.ts 手写提供。
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import preprocess from "svelte-preprocess";

/**
 * 四个游戏的 client 共用这一份。/socket.io 那条代理只影响 dev ——
 * 生产是同源,由 Caddy 转发。serverPort 让四个游戏在本地能同时跑:
 * 每个 client 转给自己那个 server,而不是全挤在 3001。
 */
export function gameViteConfig(opts = {}) {
  return {
    plugins: [tailwindcss(), svelte({ preprocess: preprocess() })],
    server: {
      ...(opts.port ? { port: opts.port, strictPort: true } : {}),
      proxy: {
        "/socket.io": {
          target: `http://localhost:${opts.serverPort ?? 3001}`,
          ws: true,
        },
      },
    },
  };
}
