# Texas Poker Deploy

Public hostname: `poker.minyu.me`

```bash
cd texas-poker
docker compose build
docker compose up -d
cd ../proxy
docker compose up -d --force-recreate caddy
```

The server container is internal only on port `3001`. The web container serves the static client and proxies `/socket.io/` to the server.
