# 部署：一份 Dockerfile、一份 Caddyfile、四个入口

这台 droplet 同时跑**多个项目**，前面是**一个共享的 Caddy 反向代理**。它占着
80/443、自动签 Let's Encrypt 证书，按公开域名把流量转给各项目自己的容器。每个
项目自带 `docker-compose.yml`，都接进同一个名为 `web` 的 external docker 网络。

```
            Internet :80/:443
                  │
          ┌───────▼────────┐   proxy/  (共享,repo 根)
          │   Caddy proxy  │   自动 TLS + 按域名路由
          └───────┬────────┘
        web 网络   │  (<域名> → <game>-web)
          ┌────────▼────────┐  platform/deploy/Caddyfile
          │  <game>-web     │  服务静态客户端,
          │  (Caddy)        │  /socket.io/ 反代给 →
          └────────┬────────┘
                   │
          ┌────────▼────────┐
          │ <game>-server   │  Node / Socket.IO (tsx),:3001 仅内网
          └─────────────────┘
```

droplet 上只需要 **Docker** 和 **Docker Compose 插件**，不用装 Node、nginx、
pm2 或 certbot。

## 四个游戏共用哪些文件

```
TwoPlayerGames/
├── proxy/                       # 共享反代(每台 droplet 一个)
│   ├── docker-compose.yml
│   └── Caddyfile                # 一个域名一个块
├── platform/deploy/
│   ├── Dockerfile               # 四个游戏共用,靠 ARG 区分
│   ├── Caddyfile                # 四个游戏共用,靠环境变量区分
│   ├── deploy-all.sh            # 一次更新所有游戏
│   └── README.md                # 本文件
├── .dockerignore                # 只有根这一份生效
└── <game>/
    ├── docker-compose.yml       # 每个游戏一份 —— 这是人要敲的入口
    └── DEPLOY.md                # 每个游戏自己的域名和取值
```

一个游戏要换的三个值全在它自己的 `docker-compose.yml` 里：

| 名字          | 是什么                                   | 在哪儿用                                                   |
| ------------- | ---------------------------------------- | ---------------------------------------------------------- |
| `GAME_DIR`    | 游戏目录名，如 `black-and-white`         | `Dockerfile` 的 `ARG`，决定 COPY 哪些路径                  |
| `SCOPE`       | npm scope，如 `@bw`                      | `Dockerfile` 的 `ARG`，决定 `npm run --workspace` 跑哪个包 |
| `GAME_SERVER` | server 服务名加端口，如 `bw-server:3001` | `*-web` 服务的 `environment`，Caddyfile 的反代目标         |

`SCOPE` 在 YAML 里**必须加引号**（`SCOPE: "@bw"`）——`@` 是 YAML 的保留指示符。

开发和生产之间不需要改任何应用代码：客户端用 `io()` 同源连接，经 Caddy 的
`/socket.io/` 反代到游戏服务器。

---

## 1. droplet 一次性设置

```bash
# 装 Docker Engine + Compose 插件(Ubuntu)
curl -fsSL https://get.docker.com | sh

# 建所有项目共用的网络
docker network create web
```

把游戏域名的 **A 记录**指向 droplet 的 IP，防火墙放开 80 和 443。

## 2. 配共享 proxy

编辑 [`proxy/Caddyfile`](../../proxy/Caddyfile)，填上你的邮箱（Let's Encrypt 通知）
和真实域名，一个游戏一个块：

```caddy
bw.example.com {
    reverse_proxy bw-web:80
}
```

启动（跑一次就行，它常驻并服务所有项目）：

```bash
cd proxy
docker compose up -d
```

> **改完 `proxy/Caddyfile` 必须 `--force-recreate`，`reload` / `restart` /
> 普通 `up -d` 都没用。** Caddyfile 是以**单个文件**挂进容器的，挂载绑在那个
> 文件的 inode 上。编辑它（尤其是 `git pull` 或会做原子保存的编辑器）会在同一
> 路径写出一个**新 inode**，运行中的容器看不见。
>
> ```bash
> cd proxy && docker compose up -d --force-recreate caddy
> ```
>
> 证书存在数据卷里，重建只是约 1 秒的抖动，不会重新签发。

## 3. 构建并启动一个游戏

```bash
cd <game>
docker compose build
docker compose up -d
```

> 构建上下文是 **repo 根**（compose 里写的是 `context: ..`），不是游戏目录。
> 命令仍在游戏目录里敲，但 Docker 读的是 repo 根的 `.dockerignore`。镜像里只会
> 进 `platform/*` 和**本游戏**的源码——`npm ci` 按根 `package-lock.json` 装，
> 实测只带一个游戏的 package.json 就够，装出来的树里 `@tpg/*` 和本游戏的
> `@scope/*` 链接齐全。好处是一个游戏改依赖不会让另外三个的 deps 层失效。

首次 HTTPS 请求时 Caddy 会自动签证书。

## 4. 代码更新后

一次更新所有游戏，在 repo 根跑：

```bash
platform/deploy/deploy-all.sh
```

它做四件事：`git pull --ff-only`；把每个有 `docker-compose.yml` 的游戏目录
（`proxy/` 除外）都 `build` 一遍；**全部构建成功后**再逐个 `up -d`；最后
`docker image prune -f` 清掉上一版留下的 dangling 镜像。已经 pull 过、只想用当前
checkout 部署，加 `--no-pull`。

先全部 build 再 up，是为了让构建失败的那次部署什么都不换：任何一个游戏构建报错，
脚本在 up 之前就退出，四个游戏都还跑着旧版本。

**哪些游戏会重启。** `up -d` 只重建镜像变了的容器，没改动的游戏保持 `Running`
（实测连跑两遍，第二遍八个容器都没动）。镜像由 `platform/` 和本游戏目录的内容决定，
所以只改了 black-and-white，就只有它重启；改了 `platform/`，四个一起重启。重启会丢掉
内存里的全部房间，正在打的局会断开，所以挑没人玩的时候部署。文档（`**/*.md`）和
`deploy-all.sh` 本身被 `.dockerignore` 排除了，改它们不会触发重启。

只更新一个游戏：

```bash
cd <game>
git pull
docker compose up -d --build
```

共享 proxy 不用动。

> 本地已经有同名镜像时，**`docker compose up -d` 不会重建**，会拿旧镜像糊弄
> 过去。要么先 `docker compose build`，要么直接 `docker compose up -d --build`。

## 5. 看状态与日志

```bash
docker compose ps
docker compose logs -f <game>-server
```

`/socket.io/` 不通、但容器都正常起着，先看 Caddy 把反代指到哪儿了：

```bash
docker compose exec <game>-web caddy adapt --config /etc/caddy/Caddyfile | grep -o '"dial":"[^"]*"'
```

看到 `GAME_SERVER-IS-UNSET:3001` 就说明 compose 里的 `GAME_SERVER` 没传到。

## 6. 再加一个游戏

1. 复制一份现有游戏的 `docker-compose.yml`，改掉 `name`、两个服务名、两个镜像名，
   以及 `GAME_DIR` / `SCOPE` / `GAME_SERVER` 三个取值。
2. 在 [`proxy/Caddyfile`](../../proxy/Caddyfile) 加一个域名块。
3. `cd proxy && docker compose up -d --force-recreate caddy`。

不用建新的 Dockerfile 或 Caddyfile，也不用记端口。

---

## 注意事项

- **只能单实例。** 游戏把房间和会话状态放在内存里，不要给 `<game>-server` 起多个
  副本。要横向扩展得先上 Socket.IO 的 Redis adapter。
- **证书在 `proxy_caddy_data` 卷里**，别删——删了 Caddy 会重新申请，可能撞上
  Let's Encrypt 的频率限制。
- **为什么有两层 Caddy？** 共享那层只管 TLS 和按域名路由（一个项目一行）；每个
  游戏自己的 `*-web` 管自己的内部结构（静态文件与 `/socket.io/` 的分流）。这样
  项目保持自包含，共享配置保持很小。
