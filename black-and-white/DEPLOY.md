# 《黑与白》Deployment Guide — Docker Compose + Caddy

This droplet hosts **multiple personal projects** behind **one shared Caddy reverse
proxy**. Caddy owns ports 80/443, terminates TLS (automatic Let's Encrypt), and routes
each public hostname to that project's container. Every project ships its own
`docker-compose.yml` and joins a shared Docker network called `web`.

```
            Internet :80/:443
                  │
          ┌───────▼────────┐   proxy/  (shared, repo root)
          │   Caddy proxy  │   auto-TLS + host routing
          └───────┬────────┘
        web network│ (bw.example.com → bw-web)
          ┌────────▼────────┐  black-and-white/
          │ bw-web (Caddy)  │  serves static client,
          │  static + /so…  │  proxies /socket.io/ →
          └────────┬────────┘
                   │
          ┌────────▼────────┐
          │   bw-server     │  Node / Socket.IO (tsx), :3001 internal only
          └─────────────────┘
```

Requirements on the droplet: **Docker** and the **Docker Compose plugin**. Nothing else
(no host Node, nginx, pm2, or certbot).

Repo layout (git root is `TwoPlayerGames/`):

```
TwoPlayerGames/
├── proxy/                 # shared reverse proxy (one per droplet)
│   ├── docker-compose.yml
│   └── Caddyfile          # one block per project, routed by hostname
└── black-and-white/
    ├── Dockerfile         # multi-stage: builds the `web` and `server` images
    ├── docker-compose.yml # bw-web + bw-server
    ├── .dockerignore
    └── web/Caddyfile      # internal: static + /socket.io/ proxy
```

No application source changes are needed between development and production. The client
connects with `io()` (same origin) and reaches the server through Caddy's `/socket.io/`
proxy.

---

## 1. One-time droplet setup

```bash
# Install Docker Engine + Compose plugin (Ubuntu)
curl -fsSL https://get.docker.com | sh

# Create the shared network that every project attaches to
docker network create web
```

Point your DNS **A record** for `bw.example.com` at the droplet's IP, and open ports
80 and 443 in the firewall.

---

## 2. Configure the shared proxy

Edit [`proxy/Caddyfile`](../proxy/Caddyfile):

- replace `you@example.com` with your email (Let's Encrypt notices),
- replace `bw.example.com` with your real hostname.

Start the proxy (run once; it stays up and serves all projects):

```bash
cd proxy
docker compose up -d
```

---

## 3. Build and run 《黑与白》

```bash
cd black-and-white
docker compose build
docker compose up -d
```

Caddy will obtain a TLS certificate automatically on the first HTTPS request. Visit
`https://bw.example.com`.

Check status / logs:

```bash
docker compose ps
docker compose logs -f bw-server
```

---

## 4. Updating after a code change

```bash
cd black-and-white
git pull
docker compose build
docker compose up -d        # recreates only changed containers
```

The shared proxy keeps running and does not need to be touched.

---

## 5. Adding another project later

1. Give the new project its own `docker-compose.yml` with `networks: [web]`
   (`external: true`) and a `*-web` service.
2. Add a block to [`proxy/Caddyfile`](../proxy/Caddyfile):

   ```caddy
   foo.example.com {
       reverse_proxy foo-web:80
   }
   ```

3. Recreate the proxy so it loads the new block:
   `cd proxy && docker compose up -d --force-recreate caddy`.

   > **Use `--force-recreate`, not `reload`/`restart`/plain `up -d`.** The Caddyfile is
   > bind-mounted as a *single file*, so the mount is pinned to that file's inode. Editing
   > it (especially via `git pull` or an atomic-save editor) writes a *new* inode at the
   > path, which the running container can't see — so `caddy reload`, `docker compose
   > restart`, and a plain `docker compose up -d` (spec unchanged → no recreate) all keep
   > serving the *old* config. `--force-recreate` re-binds the mount. Certs persist in the
   > data volume, so it's a ~1s blip with no re-issuance.

No port bookkeeping, no per-project TLS setup.

---

## Notes

- **Single instance only.** The game keeps room/session state in memory, so do not run
  more than one `bw-server` replica. Horizontal scaling would require a Socket.IO Redis
  adapter for shared state.
- **Certificates persist** in the `proxy_caddy_data` volume — don't delete it, or Caddy
  re-requests certs and can hit Let's Encrypt rate limits.
- **Why two Caddys?** The shared proxy only does TLS + hostname routing (one line per
  project); each project's own `*-web` container owns its internal layout (static files
  + `/socket.io/` split). This keeps projects self-contained and the shared config tiny.

---

## Quick reference

| Step | Command |
|------|---------|
| Create shared network | `docker network create web` |
| Start shared proxy | `cd proxy && docker compose up -d` |
| Build app | `cd black-and-white && docker compose build` |
| Start app | `docker compose up -d` |
| Update app | `git pull && docker compose build && docker compose up -d` |
| Logs | `docker compose logs -f bw-server` |
| Reload proxy after Caddyfile edit | `cd proxy && docker compose up -d --force-recreate caddy` (single-file mount — `reload`/`restart` won't pick up edits) |
