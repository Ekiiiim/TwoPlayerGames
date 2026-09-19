#!/usr/bin/env bash
# 在 droplet 上一次更新所有游戏:拉代码,四个镜像全部构建成功后再逐个换容器。
#
#   platform/deploy/deploy-all.sh            # git pull 后部署
#   platform/deploy/deploy-all.sh --no-pull  # 只用当前 checkout 部署
#
# 游戏列表不写死:repo 根下每个有 docker-compose.yml 的目录都算,proxy/ 除外。
# 共享 proxy 不在这里重建 —— 它只在 proxy/Caddyfile 改过时才需要动,见 README。
set -euo pipefail

main() {
  cd "$(dirname "$0")/../.."

  # pull 可能改到这个脚本本身。用 exec 重新跑一遍,执行的就是拉下来的新版本。
  if [[ "${1:-}" != "--no-pull" ]]; then
    git pull --ff-only
    exec platform/deploy/deploy-all.sh --no-pull
  fi

  local games=()
  for f in */docker-compose.yml; do
    [[ "${f%/*}" == proxy ]] && continue
    games+=("${f%/*}")
  done
  echo "games: ${games[*]}"

  # 先全部 build 再 up:任何一个游戏构建失败,所有线上容器都还是旧版本,
  # 不会留下一半新一半旧。停机时间也只剩换容器那几秒。
  for g in "${games[@]}"; do
    echo "==> build $g"
    (cd "$g" && docker compose build)
  done
  for g in "${games[@]}"; do
    echo "==> up $g"
    (cd "$g" && docker compose up -d)
  done

  # 每次重建都会把上一版镜像变成 dangling,不清的话磁盘每次部署涨几百 MB。
  docker image prune -f

  for g in "${games[@]}"; do
    (cd "$g" && docker compose ps --format '{{.Name}}\t{{.Status}}')
  done
}

main "$@"
