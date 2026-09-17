# Add to Fifty Deploy

Public hostname: `add2fifty.minyu.me`

1. Build and run this game:

   ```bash
   cd add-to-fifty
   docker compose build
   docker compose up -d
   ```

> 构建上下文是 repo 根（compose 里写的是 `context: ..`），不是本游戏目录。
> 命令仍在本目录里敲，但 Docker 读的是 repo 根的 `.dockerignore`，并且会把
> 四个游戏和 `platform/*` 的 `package.json` 全部读进去 —— 根
> `package-lock.json` 覆盖全部 workspace，`npm ci` 要求两者一致。

2. Ensure the shared Docker network exists:

   ```bash
   docker network create web
   ```

   It is fine if Docker reports that the network already exists.

3. Recreate the shared proxy after editing `../proxy/Caddyfile`:

   ```bash
   cd ../proxy
   docker compose up -d --force-recreate caddy
   ```

The game server is internal only on port `3001`. The game web container serves the static client and proxies `/socket.io/` to the server.
