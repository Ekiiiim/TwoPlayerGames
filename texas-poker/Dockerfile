# syntax=docker/dockerfile:1

# ---- install workspace deps (cached unless a package.json changes) ----
# 构建上下文是 repo 根(见 docker-compose.yml 的 context: ..)。
# 根 package-lock.json 覆盖全部 workspace,而 npm ci 要求 lockfile 与 workspace
# 树一致,所以四个游戏和 platform/* 的 package.json 全部 COPY 进来 —— 哪怕本镜像
# 只构建其中一个游戏。它们都是几百字节,源码不进来。代价是任一 package.json 变动
# 会让四个镜像的 deps 层一起失效;部署是手动触发的,不是 CI 每次跑。
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY platform/protocol/package.json ./platform/protocol/
COPY platform/server/package.json ./platform/server/
COPY platform/client/package.json ./platform/client/
COPY platform/ui/package.json ./platform/ui/
COPY platform/build/package.json ./platform/build/
COPY black-and-white/packages/client/package.json ./black-and-white/packages/client/
COPY black-and-white/packages/server/package.json ./black-and-white/packages/server/
COPY black-and-white/packages/shared/package.json ./black-and-white/packages/shared/
COPY flip-math/packages/client/package.json ./flip-math/packages/client/
COPY flip-math/packages/server/package.json ./flip-math/packages/server/
COPY flip-math/packages/shared/package.json ./flip-math/packages/shared/
COPY add-to-fifty/packages/client/package.json ./add-to-fifty/packages/client/
COPY add-to-fifty/packages/server/package.json ./add-to-fifty/packages/server/
COPY add-to-fifty/packages/shared/package.json ./add-to-fifty/packages/shared/
COPY texas-poker/packages/client/package.json ./texas-poker/packages/client/
COPY texas-poker/packages/server/package.json ./texas-poker/packages/server/
COPY texas-poker/packages/shared/package.json ./texas-poker/packages/shared/
RUN npm ci

# ---- build the static client bundle ----
FROM deps AS client-build
COPY platform ./platform
COPY texas-poker/packages/shared ./texas-poker/packages/shared
COPY texas-poker/packages/client ./texas-poker/packages/client
RUN npm run build --workspace @texas-poker/client
# Vite output -> /app/texas-poker/packages/client/dist

# ---- web: Caddy serving the static bundle + proxying socket.io internally ----
FROM caddy:2-alpine AS web
COPY --from=client-build /app/texas-poker/packages/client/dist /srv
COPY texas-poker/web/Caddyfile /etc/caddy/Caddyfile

# ---- server: Node running Socket.IO via tsx (shared is consumed as raw TS) ----
# 从 deps 整块拷 /app,把 node_modules 和全部 package.json 一起带过来,
# 这样 npm run --workspace 解析 workspace 时树是完整的。
FROM node:22-alpine AS server
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=deps /app ./
COPY platform ./platform
COPY texas-poker/packages/shared ./texas-poker/packages/shared
COPY texas-poker/packages/server ./texas-poker/packages/server
EXPOSE 3001
CMD ["npm", "run", "start", "--workspace", "@texas-poker/server"]
