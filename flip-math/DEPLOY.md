# 部署 flip-math

|               |                      |
| ------------- | -------------------- |
| 公开域名      | `flipmath.minyu.me`  |
| compose 服务  | `fm-web / fm-server` |
| `GAME_DIR`    | `flip-math`          |
| `SCOPE`       | `@fm`                |
| `GAME_SERVER` | `fm-server:3001`     |

```bash
cd flip-math
docker compose build
docker compose up -d
```

`proxy/Caddyfile` 里要有这个域名的块：

```caddy
flipmath.minyu.me {
    reverse_proxy fm-web:80
}
```

改过 `proxy/Caddyfile` 之后**必须** `cd proxy && docker compose up -d --force-recreate caddy`——
单文件挂载绑在旧 inode 上，`reload` / `restart` / 普通 `up -d` 都读不到新内容。

droplet 一次性设置、构建上下文为什么是 repo 根、`/socket.io/` 不通时怎么查，
见 [`platform/deploy/README.md`](../platform/deploy/README.md)。
