#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
WORKER_DIR="$ROOT_DIR/worker"

log() {
  printf '\n==> %s\n' "$*"
}

die() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

require_dir() {
  [[ -d "$1" ]] || die "Missing required directory: $1"
}

if command -v wrangler >/dev/null 2>&1; then
  WRANGLER=(wrangler)
elif command -v npx >/dev/null 2>&1; then
  WRANGLER=(npx --yes wrangler)
else
  die "Wrangler is required. Install it with: npm install -g wrangler"
fi

require_dir "$FRONTEND_DIR"
require_dir "$WORKER_DIR"

log "Running frontend unit tests"
npm --prefix "$FRONTEND_DIR" test

log "Running Worker unit tests"
npm --prefix "$WORKER_DIR" test

log "Building frontend"
npm --prefix "$FRONTEND_DIR" run build

log "Building Worker bundle with Wrangler dry run"
(
  cd "$WORKER_DIR"
  "${WRANGLER[@]}" deploy --dry-run "$@"
)

log "Deploying Worker and frontend assets to Cloudflare"
(
  cd "$WORKER_DIR"
  "${WRANGLER[@]}" deploy "$@"
)
