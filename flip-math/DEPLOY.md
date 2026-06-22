# 部署《翻牌数式》(flip-math)

共用一台 droplet 上的共享 `proxy/`(占用 80/443、自动 TLS),自带 compose + Caddyfile。

## 前置

- droplet 上有外部 docker 网络 `web`(若不存在:`docker network create web`)。
- 共享 `proxy/` 已在运行。
- DNS:`flipmath.minyu.me` 的 A 记录指向本 droplet。

## 步骤

1. 把本仓库同步到 droplet。
2. 确认 `proxy/Caddyfile` 含:
   ```
   flipmath.minyu.me {
       reverse_proxy fm-web:80
   }
   ```
   改过 `proxy/Caddyfile` 后,**重建**代理容器让它重新挂载:
   `cd proxy && docker compose up -d --force-recreate caddy`。
   (单文件挂载绑定到旧 inode,`caddy reload`/`docker compose restart`/普通 `up -d` 都读不到新内容;
   详见 `black-and-white/DEPLOY.md`。证书在数据卷里,重建只是约 1 秒抖动、不重签。)
3. 构建并启动本游戏:
   ```
   cd flip-math
   docker compose build
   docker compose up -d
   ```
4. 访问 `https://flipmath.minyu.me`,Caddy 会自动签发证书。

## 说明

- `fm-server` 仅在 `web` 网络内可达(`expose: 3001`,不对外发布)。
- `fm-web`(Caddy)服务静态客户端,并把 `/socket.io/` 反代到 `fm-server:3001`。
- 客户端用 `io()` 同源连接;`CORS_ORIGIN` 环境变量可覆盖(生产默认同源)。
