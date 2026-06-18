# syntax=docker/dockerfile:1

# ---- install workspace deps (cached unless a package.json changes) ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/client/package.json ./packages/client/
COPY packages/server/package.json ./packages/server/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci

# ---- build the static client bundle ----
FROM deps AS client-build
COPY packages/shared ./packages/shared
COPY packages/client ./packages/client
RUN npm run build --workspace @fm/client
# Vite output -> /app/packages/client/dist

# ---- web: Caddy serving the static bundle + proxying socket.io internally ----
FROM caddy:2-alpine AS web
COPY --from=client-build /app/packages/client/dist /srv
COPY web/Caddyfile /etc/caddy/Caddyfile

# ---- server: Node running Socket.IO via tsx (shared consumed as raw TS) ----
FROM node:22-alpine AS server
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
EXPOSE 3001
CMD ["npm", "run", "start", "--workspace", "@fm/server"]
