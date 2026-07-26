# Add to Fifty Deploy

Public hostname: `add2fifty.minyu.me`

1. Build and run this game:

   ```bash
   cd add-to-fifty
   docker compose build
   docker compose up -d
   ```

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
