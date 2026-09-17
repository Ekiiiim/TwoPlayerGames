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
