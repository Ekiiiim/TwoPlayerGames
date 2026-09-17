# 部署 black-and-white

|               |                      |
| ------------- | -------------------- |
| 公开域名      | `bw.minyu.me`        |
| compose 服务  | `bw-web / bw-server` |
| `GAME_DIR`    | `black-and-white`    |
| `SCOPE`       | `@bw`                |
| `GAME_SERVER` | `bw-server:3001`     |

```bash
cd black-and-white
docker compose build
docker compose up -d
```

`proxy/Caddyfile` 里要有这个域名的块：

```caddy
bw.minyu.me {
    reverse_proxy bw-web:80
}
```

改过 `proxy/Caddyfile` 之后**必须** `cd proxy && docker compose up -d --force-recreate caddy`——
单文件挂载绑在旧 inode 上，`reload` / `restart` / 普通 `up -d` 都读不到新内容。

droplet 一次性设置、构建上下文为什么是 repo 根、`/socket.io/` 不通时怎么查，
见 [`platform/deploy/README.md`](../platform/deploy/README.md)。
