# 部署 add-to-fifty

|               |                                          |
| ------------- | ---------------------------------------- |
| 公开域名      | `add2fifty.minyu.me`                     |
| compose 服务  | `add-to-fifty-web / add-to-fifty-server` |
| `GAME_DIR`    | `add-to-fifty`                           |
| `SCOPE`       | `@add-to-fifty`                          |
| `GAME_SERVER` | `add-to-fifty-server:3001`               |

```bash
cd add-to-fifty
docker compose build
docker compose up -d
```

`proxy/Caddyfile` 里要有这个域名的块：

```caddy
add2fifty.minyu.me {
    reverse_proxy add-to-fifty-web:80
}
```

改过 `proxy/Caddyfile` 之后**必须** `cd proxy && docker compose up -d --force-recreate caddy`——
单文件挂载绑在旧 inode 上，`reload` / `restart` / 普通 `up -d` 都读不到新内容。

droplet 一次性设置、构建上下文为什么是 repo 根、`/socket.io/` 不通时怎么查，
见 [`platform/deploy/README.md`](../platform/deploy/README.md)。
