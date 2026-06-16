# 《黑与白》Deployment Guide — DigitalOcean Droplet

Recommended architecture: **nginx serves the static client build and reverse-proxies
`/socket.io/` to the Node server; the Node server runs only Socket.IO (no static hosting);
pm2 keeps Node alive; Let's Encrypt/certbot for TLS.**

Requirements: Node 18+, npm, nginx, pm2, certbot.

---

## 1. Build

On the droplet (or CI), install dependencies and build the client:

```bash
npm install
npm run build --workspace @bw/client
```

The Vite output lands in `packages/client/dist/`.

Copy it to the nginx web root:

```bash
sudo mkdir -p /var/www/bw
sudo cp -r packages/client/dist/. /var/www/bw/
```

---

## 2. Run the server with pm2

The server (`@bw/server`) is started via `tsx src/index.ts` and reads `PORT` from the
environment (default `3001`). Node 18 or newer is required.

```bash
# Install pm2 globally
npm install -g pm2

# Start the server
PORT=3001 pm2 start "npm run start --workspace @bw/server" --name bw-server

# Persist across reboots
pm2 save
pm2 startup     # follow the printed command to enable the systemd/init hook
```

Check status:

```bash
pm2 status
pm2 logs bw-server
```

---

## 3. nginx configuration

Create `/etc/nginx/sites-available/bw`:

```nginx
server {
    listen 80;
    server_name your.domain;

    root /var/www/bw;
    index index.html;

    # SPA fallback — all unknown paths serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # WebSocket reverse-proxy to the Node/Socket.IO server
    location /socket.io/ {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       $host;
    }
}
```

Enable the site and reload:

```bash
sudo ln -s /etc/nginx/sites-available/bw /etc/nginx/sites-enabled/bw
sudo nginx -t && sudo systemctl reload nginx
```

---

## 4. TLS with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your.domain
```

certbot rewrites the nginx config to add the `listen 443 ssl` block and schedules
automatic renewal via a systemd timer or cron job. No further action is needed.

---

## 5. Client connection in production

In development, Vite proxies `/socket.io` to `http://localhost:3001` (see
`packages/client/vite.config.ts`). In production the client is served same-origin from
nginx, so `io()` in `packages/client/src/socket.ts` connects to the same host without
any URL argument. WebSocket traffic flows through nginx's `/socket.io/` reverse-proxy
block to the Node server on port 3001. No source-code change is required between
development and production.

---

## Quick reference

| Step | Command |
|------|---------|
| Install deps | `npm install` |
| Build client | `npm run build --workspace @bw/client` |
| Copy dist | `sudo cp -r packages/client/dist/. /var/www/bw/` |
| Start server | `PORT=3001 pm2 start "npm run start --workspace @bw/server" --name bw-server` |
| Persist pm2 | `pm2 save && pm2 startup` |
| Test nginx config | `sudo nginx -t` |
| Reload nginx | `sudo systemctl reload nginx` |
| Enable TLS | `sudo certbot --nginx -d your.domain` |
