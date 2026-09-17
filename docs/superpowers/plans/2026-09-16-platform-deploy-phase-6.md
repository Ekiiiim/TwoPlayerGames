# 阶段 6：部署文件合并实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 四份 `Dockerfile`（212 行）合成一份 `platform/deploy/Dockerfile`，四份 `web/Caddyfile`（88 行）合成一份，四份 `DEPLOY.md`（261 行）里讲同一套步骤的部分搬进一份共享文档。四份 `docker-compose.yml` 保留。

**Architecture:** 游戏目录名和 npm scope 由 `ARG GAME_DIR` / `ARG SCOPE` 传入，取值写在各游戏的 compose 里；Caddy 的反代目标用 `{$GAME_SERVER}` 环境变量占位，同样由 compose 传。compose 保留四份是因为它是人要直接敲的入口（`cd black-and-white && docker compose up -d`），一个游戏一个入口比一份 compose 配四个 `--env-file` 好记。

**Tech Stack:** Docker multi-stage build ｜ Docker Compose ｜ Caddy 2

**Spec:** `docs/superpowers/specs/2026-09-16-platform-extraction-design.md`（阶段 6 在 6.1–6.6 节）

---

## Global Constraints

- **`ARG` 的作用域止于所在 stage。** 每个 stage 用到就要重新声明一次，漏一个会展开成空字符串，`COPY` 到错的路径而且**不报错**。
- **`CMD` 要用 shell 形式**（不带 JSON 数组），exec 形式不做变量替换。运行期要用的 scope 得先固化成 `ENV`——`ARG` 只活在构建期。
- **compose 里 `SCOPE` 的值必须加引号**：`@` 是 YAML 的保留指示符，`SCOPE: @bw` 解析会报错。
- **构建上下文是 repo 根**（compose 里 `context: ..`），`.dockerignore` 只认 repo 根那一份。
- **不要 `git push`。**

---

## 动手前已经验过的三件事

**1. `npm ci` 只带一个游戏的 package.json 就能跑。** 现行四份 Dockerfile 把四个游戏 12 份 package.json 全 COPY 进去，注释说「`npm ci` 要求 lockfile 与 workspace 树一致」。实测不需要：只带 `platform/*` 五份加本游戏三份，`npm ci` 正常，装出来的树里 `@tpg/{protocol,server,client,ui,build}` 和 `@bw/{client,server,shared}` 链接齐全，`node_modules/@fm` 不存在，`socket.io` / `tsx` / `vite` 都在。

所以现行那条注释是没验证过的防御性写法。改掉之后还白捡一个好处：**一个游戏改依赖不再让另外三个的 deps 层失效**——spec 6.2 把这个当成「接受的代价」，其实不必付。

**2. Caddy 的 `{$GAME_SERVER}` 占位可用。** 传了环境变量时 `caddy adapt` 出来的 upstream 是 `{"dial":"bw-server:3001"}`，和写死主机名逐字相同。

**3. 但没传的时候它会静默变成「没有 upstream」。** `caddy adapt` 照常成功、容器照常起来，只是 `/socket.io/` 通向空气。所以占位要带一个明显错的默认值：

```
reverse_proxy {$GAME_SERVER:GAME_SERVER-IS-UNSET:3001}
```

没传时 upstream 变成 `GAME_SERVER-IS-UNSET:3001`，日志里直接把变量名喊出来，而不是让人对着一个「能起但不通」的容器猜。

---

## File Structure

| 文件 | 动作 |
| --- | --- |
| `platform/deploy/Dockerfile` | **新建**，四份合一 |
| `platform/deploy/Caddyfile` | **新建**，四份合一 |
| `platform/deploy/README.md` | **新建**，四份 DEPLOY.md 的公共部分 |
| `<game>/Dockerfile` ×4 | **删** |
| `<game>/web/Caddyfile` ×4 | **删**（`web/` 目录随之空掉，一并删） |
| `<game>/docker-compose.yml` ×4 | 改 `dockerfile:` 指向、加 `args:`、给 `*-web` 加 `environment:` |
| `<game>/DEPLOY.md` ×4 | 缩成自己的域名、服务名、ARG 取值，链到共享文档 |
| `.dockerignore` | 改掉那条已经不成立的注释 |

---

### Task 1: 合并 Dockerfile

**Files:**
- Create: `platform/deploy/Dockerfile`
- Delete: `black-and-white/Dockerfile`、`flip-math/Dockerfile`、`add-to-fifty/Dockerfile`、`texas-poker/Dockerfile`
- Modify: 四个 `docker-compose.yml`、`.dockerignore`

- [ ] **Step 1: 写合并版**

`platform/deploy/Dockerfile`。web stage 这一步仍然 COPY 各游戏自己的 `web/Caddyfile`——Caddyfile 的合并是 Task 2，这样两个 task 各自能独立验证。

```dockerfile
# syntax=docker/dockerfile:1

# 一份 Dockerfile 服务四个游戏。游戏目录名和 npm scope 由 ARG 传入,
# 取值写在各游戏的 docker-compose.yml 里。
#
# ARG 的作用域止于所在 stage —— 每个 stage 用到就要重新声明一次。
# 漏一个不会报错,它会展开成空字符串,然后 COPY 到错的路径。

# ---- install workspace deps (cached unless a package.json changes) ----
# 构建上下文是 repo 根(compose 里的 context: ..)。根 package-lock.json 覆盖
# 全部 workspace,npm ci 要按它装,所以 platform/* 五个包的 package.json 全要;
# 游戏那三个只要本镜像构建的这一个 —— 实测只带一个游戏 npm ci 正常,装出来的
# 树里 @tpg/* 和本游戏的 @scope/* 链接齐全。好处是一个游戏改依赖不会让另外
# 三个的 deps 层失效。
FROM node:22-alpine AS deps
ARG GAME_DIR
WORKDIR /app
COPY package.json package-lock.json ./
COPY platform/protocol/package.json ./platform/protocol/
COPY platform/server/package.json ./platform/server/
COPY platform/client/package.json ./platform/client/
COPY platform/ui/package.json ./platform/ui/
COPY platform/build/package.json ./platform/build/
COPY ${GAME_DIR}/packages/shared/package.json ./${GAME_DIR}/packages/shared/
COPY ${GAME_DIR}/packages/server/package.json ./${GAME_DIR}/packages/server/
COPY ${GAME_DIR}/packages/client/package.json ./${GAME_DIR}/packages/client/
RUN npm ci

# ---- build the static client bundle ----
FROM deps AS client-build
ARG GAME_DIR
ARG SCOPE
COPY platform ./platform
COPY ${GAME_DIR}/packages/shared ./${GAME_DIR}/packages/shared
COPY ${GAME_DIR}/packages/client ./${GAME_DIR}/packages/client
RUN npm run build --workspace ${SCOPE}/client
# Vite output -> /app/${GAME_DIR}/packages/client/dist

# ---- web: Caddy serving the static bundle + proxying socket.io internally ----
FROM caddy:2-alpine AS web
ARG GAME_DIR
COPY --from=client-build /app/${GAME_DIR}/packages/client/dist /srv
COPY ${GAME_DIR}/web/Caddyfile /etc/caddy/Caddyfile

# ---- server: Node running Socket.IO via tsx (shared is consumed as raw TS) ----
# 从 deps 整块拷 /app,把 node_modules 和 package.json 一起带过来,
# 这样 npm run --workspace 解析 workspace 时树是完整的。
FROM node:22-alpine AS server
ARG GAME_DIR
ARG SCOPE
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
# CMD 要在运行期展开 scope,而 ARG 只活在构建期,所以先固化成 ENV。
ENV SCOPE=${SCOPE}
COPY --from=deps /app ./
COPY platform ./platform
COPY ${GAME_DIR}/packages/shared ./${GAME_DIR}/packages/shared
COPY ${GAME_DIR}/packages/server ./${GAME_DIR}/packages/server
EXPOSE 3001
# shell 形式,让 ${SCOPE} 被展开;exec 形式(JSON 数组)不做变量替换。
CMD npm run start --workspace ${SCOPE}/server
```

- [ ] **Step 2: 四个 compose 改 build 段**

每个游戏的两个服务都要改。`SCOPE` 的值必须加引号——`@` 是 YAML 保留指示符。

| 游戏 | GAME_DIR | SCOPE |
| --- | --- | --- |
| black-and-white | `black-and-white` | `"@bw"` |
| flip-math | `flip-math` | `"@fm"` |
| add-to-fifty | `add-to-fifty` | `"@add-to-fifty"` |
| texas-poker | `texas-poker` | `"@texas-poker"` |

以 bw 为例，两处 `build:` 都变成：

```yaml
    build:
      context: ..
      dockerfile: platform/deploy/Dockerfile
      target: server        # 另一处是 web
      args:
        GAME_DIR: black-and-white
        SCOPE: "@bw"
```

- [ ] **Step 3: 删四份 Dockerfile**

```bash
rm black-and-white/Dockerfile flip-math/Dockerfile add-to-fifty/Dockerfile texas-poker/Dockerfile
```

- [ ] **Step 4: 改 .dockerignore 那条注释**

现在那条写的是「四个游戏的 package.json 都得进镜像」，已经不成立了。改成说明为什么仍然不能按游戏名排除源码（构建上下文是共享的，一份 `.dockerignore` 服务四个游戏的构建）。

- [ ] **Step 5: 八个镜像构建**

```bash
for g in black-and-white:bw flip-math:flip add-to-fifty:a2f texas-poker:tp; do
  d=${g%%:*}; t=${g##*:}
  ( cd "$d" && docker compose build ) >/tmp/b-$t.log 2>&1 && echo "$d OK" || { echo "$d FAILED"; tail -20 /tmp/b-$t.log; }
done
```

Expected: 四行 `OK`（`docker compose build` 一次建该游戏的两个 target）。

用 `docker compose build` 而不是 `docker build`：它会把 compose 里的 `args` 真的传进去，`docker build` 不带 `--build-arg` 的话 `GAME_DIR` 是空的，`COPY /packages/shared` 会在一个谁都想不到的地方失败。

- [ ] **Step 6: 四个栈起来确认**

```bash
for d in black-and-white flip-math add-to-fifty texas-poker; do ( cd "$d" && docker compose up -d --build >/dev/null 2>&1 ); done
sleep 6
for d in black-and-white flip-math add-to-fifty texas-poker; do
  svc=$(cd "$d" && docker compose config --services 2>/dev/null | grep -- '-web$')
  printf "%-18s " "$d"
  log=$(cd "$d" && docker compose logs 2>/dev/null | grep -o "server on :3001" | head -1)
  sid=$(cd "$d" && docker compose exec -T "$svc" wget -qO- "http://localhost/socket.io/?EIO=4&transport=polling" 2>/dev/null | grep -o '"sid"' | head -1)
  echo "$log | $sid"
done
```

Expected: 四行 `server on :3001 | "sid"`。

`--build` 不能省——本地已有同名镜像时 `docker compose up -d` 不重建，会拿旧镜像糊弄过去（阶段 5 踩过一次，差点把「样式没生成」误判成 `@source` 失效）。

- [ ] **Step 7: commit**

```bash
for d in black-and-white flip-math add-to-fifty texas-poker; do ( cd "$d" && docker compose down >/dev/null 2>&1 ); done
npx prettier --write platform/deploy '*/docker-compose.yml'
npm run format:check
git add -A
git commit -m "build: merge the four Dockerfiles into platform/deploy"
```

---

### Task 2: 合并 Caddyfile

**Files:**
- Create: `platform/deploy/Caddyfile`
- Delete: 四个 `<game>/web/Caddyfile`（连带空掉的 `web/` 目录）
- Modify: `platform/deploy/Dockerfile`（web stage 改 COPY 来源）、四个 `docker-compose.yml`（给 `*-web` 加 `environment`）

- [ ] **Step 1: 写合并版**

四份只差反代目标主机名（`bw-server` / `fm-server` / `add-to-fifty-server` / `texas-poker-server`）。

`platform/deploy/Caddyfile`：

```
# 四个游戏共用。每个游戏的内部门面:静态客户端 + /socket.io/ 反代。
# 纯 HTTP :80 —— TLS 由前面那层共享 proxy 处理。
#
# GAME_SERVER 由各游戏 compose 的 environment 传进来(如 bw-server:3001)。
# 默认值是故意写坏的:没传的时候 caddy adapt 照常成功、容器照常起来,只是
# reverse_proxy 一个 upstream 都没有、/socket.io/ 通向空气。宁可让它连一个
# 明显不存在的主机,日志里把变量名喊出来。
:80 {
	encode gzip

	handle /socket.io/* {
		reverse_proxy {$GAME_SERVER:GAME_SERVER-IS-UNSET:3001}
	}

	handle {
		root * /srv
		try_files {path} /index.html
		file_server
	}
}
```

- [ ] **Step 2: Dockerfile 的 web stage 改来源**

```dockerfile
FROM caddy:2-alpine AS web
ARG GAME_DIR
COPY --from=client-build /app/${GAME_DIR}/packages/client/dist /srv
COPY platform/deploy/Caddyfile /etc/caddy/Caddyfile
```

`ARG GAME_DIR` 仍然要留——上面那行 `COPY --from=client-build` 用得到。

- [ ] **Step 3: 四个 compose 的 `*-web` 加环境变量**

```yaml
  bw-web:
    build: ...
    image: bw-web
    restart: unless-stopped
    environment:
      GAME_SERVER: bw-server:3001
    depends_on:
      - bw-server
```

四个游戏的取值就是各自的 server 服务名加 `:3001`。

- [ ] **Step 4: 删四份 Caddyfile**

```bash
rm -r black-and-white/web flip-math/web add-to-fifty/web texas-poker/web
```

- [ ] **Step 5: 重建并验证反代真的通**

```bash
for d in black-and-white flip-math add-to-fifty texas-poker; do ( cd "$d" && docker compose up -d --build >/dev/null 2>&1 ); done
sleep 6
for d in black-and-white flip-math add-to-fifty texas-poker; do
  svc=$(cd "$d" && docker compose config --services 2>/dev/null | grep -- '-web$')
  printf "%-18s " "$d"
  # 握手拿到 sid 就说明 GAME_SERVER 传对了 —— 传错的话这里是空的
  ( cd "$d" && docker compose exec -T "$svc" wget -qO- "http://localhost/socket.io/?EIO=4&transport=polling" 2>/dev/null | head -c 60 )
  echo
done
```

Expected: 四行都以 `0{"sid":"` 开头。

再确认一次占位真的被替换了（而不是碰巧走到默认值）：

```bash
cd black-and-white && docker compose exec -T bw-web caddy adapt --config /etc/caddy/Caddyfile 2>/dev/null | grep -o '"dial":"[^"]*"'
```

Expected: `"dial":"bw-server:3001"`，不是 `GAME_SERVER-IS-UNSET:3001`。

- [ ] **Step 6: commit**

```bash
for d in black-and-white flip-math add-to-fifty texas-poker; do ( cd "$d" && docker compose down >/dev/null 2>&1 ); done
npx prettier --write '*/docker-compose.yml'
npm run format:check
git add -A
git commit -m "build: merge the four web Caddyfiles into platform/deploy"
```

---

### Task 3: DEPLOY.md

**Files:**
- Create: `platform/deploy/README.md`
- Rewrite: 四个 `<game>/DEPLOY.md`

现状不是 spec 说的「四份 239 行讲同一套」：black-and-white 那份 167 行是完整版（droplet 一次性设置、共享 proxy、架构图、为什么两层 Caddy、证书卷、单实例限制），另外三份 18–43 行只是各自的域名加几条命令。四份里重复的是那段关于构建上下文的引用块，而且它现在**说错了**——它写「会把四个游戏的 package.json 全部读进去」，Task 1 之后只读一个游戏的。

- [ ] **Step 1: `platform/deploy/README.md`**

把 black-and-white 那份里与游戏无关的部分整体搬过来：架构图（主机名和服务名改成占位）、droplet 一次性设置、共享 proxy 的配置与**必须 `--force-recreate`** 那段（单文件挂载绑 inode 的坑）、构建/更新/看日志的命令、单实例与证书卷的注意事项。再加一节讲这一阶段新的东西：`GAME_DIR` / `SCOPE` 两个 ARG 和 `GAME_SERVER` 环境变量分别是什么、在哪儿改。

- [ ] **Step 2: 四份 DEPLOY.md 缩成一页**

每份只留这个游戏独有的东西，其余链到共享文档：

```markdown
# 部署 black-and-white

| | |
| --- | --- |
| 公开域名 | `bw.minyu.me` |
| compose 服务 | `bw-web` / `bw-server` |
| `GAME_DIR` | `black-and-white` |
| `SCOPE` | `@bw` |
| `GAME_SERVER` | `bw-server:3001` |

```bash
cd black-and-white
docker compose build
docker compose up -d
```

首次部署、改 `proxy/Caddyfile` 之后要怎么重建代理、以及为什么构建上下文是
repo 根——见 [`platform/deploy/README.md`](../platform/deploy/README.md)。
```

各游戏的实际域名从现有 DEPLOY.md 里取：bw 用的是示例域名 `bw.example.com`（保持），flip-math `flipmath.minyu.me`，add-to-fifty `add2fifty.minyu.me`，texas-poker `poker.minyu.me`。

- [ ] **Step 3: commit**

```bash
npx prettier --write platform/deploy '*/DEPLOY.md'
npm run format:check
git add -A
git commit -m "docs: hoist the shared deploy steps into platform/deploy/README.md"
```

---

### Task 4: 阶段验收与合并

- [ ] **Step 1: 全量测试 + svelte-check** —— 本阶段不碰应用代码，214 个测试和四个 svelte-check 应当原样全绿。

- [ ] **Step 2: 四个栈从零构建并跑通**

```bash
for d in black-and-white flip-math add-to-fifty texas-poker; do ( cd "$d" && docker compose build --no-cache >/dev/null 2>&1 && docker compose up -d >/dev/null 2>&1 ); done
```

`--no-cache` 一次，确认合并后的 Dockerfile 从零开始也能走通（缓存会掩盖 ARG 传递的问题）。

- [ ] **Step 3: 四个栈各自握手 + 静态包可达**（同 Task 2 Step 5）。

- [ ] **Step 4: 浏览器里真打一局。** 把其中一个游戏的 web 容器临时发布到宿主端口，在浏览器里建房、用 node 端的 p2 加入、走一个动作。这是阶段 6 唯一能证明「合并后的镜像里跑的还是同一个游戏」的步骤。

- [ ] **Step 5: 行数对照**，写进 spec 的 6.6。

- [ ] **Step 6: 把三处发现写回 spec**（`npm ci` 只需一个游戏、Caddy 占位未设时静默失效、DEPLOY.md 的现状不是四份等长）。

- [ ] **Step 7: 勾完 checkbox，commit，合回 main。不要 `git push`。**
