#!/usr/bin/env bash
# Deploy latest main to production: git pull -> deps -> build -> migrate -> PM2 reload.
# Run on the prod server: ./scripts/deploy.sh [--seed]
set -euo pipefail

# Move to the project root regardless of where the script is invoked from.
cd "$(dirname "$0")/.."

RUN_SEED=false
for arg in "$@"; do
  case "$arg" in
    --seed) RUN_SEED=true ;;
    -h|--help) echo "Usage: ./scripts/deploy.sh [--seed]"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; echo "Usage: ./scripts/deploy.sh [--seed]" >&2; exit 1 ;;
  esac
done

echo "==> Deploying lwc-data-server ($(date))"

echo "==> git pull (main, fast-forward only)"
git fetch origin main
git checkout main
git pull --ff-only origin main

echo "==> npm ci"
npm ci

echo "==> prisma generate"      # must run BEFORE tsc (generated client is gitignored)
npx prisma generate

echo "==> npm run build"
npm run build

echo "==> prisma migrate deploy"   # idempotent
npx prisma migrate deploy

if [ "$RUN_SEED" = true ]; then
  echo "==> npm run seed"          # idempotent; uses ts-node (devDep) — MUST run before prune
  npm run seed
fi

echo "==> npm prune --omit=dev"    # drop devDeps to save disk (after build + optional seed)
npm prune --omit=dev

echo "==> pm2 startOrReload"       # starts on first run, graceful reload after
pm2 startOrReload ecosystem.config.js --update-env
pm2 save                           # persist process list for pm2 startup (boot)

# Health check (read PORT from .env, default 3001)
PORT="$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')"
PORT="${PORT:-3001}"
echo "==> Health check http://localhost:${PORT}/health"
for i in $(seq 1 10); do
  if curl -fsS "http://localhost:${PORT}/health" >/dev/null 2>&1; then
    echo "==> Healthy. Deploy complete."
    exit 0
  fi
  if [ "$i" -eq 10 ]; then
    echo "Health check failed after 10s — recent logs:" >&2
    pm2 logs lwc-data-server --lines 30 --nostream >&2 || true
    exit 1
  fi
  sleep 1
done
