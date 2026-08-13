#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export BODY_STORE_DIR="${BODY_STORE_DIR:-$ROOT/.local/bodies}"
mkdir -p "$BODY_STORE_DIR"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  nvm use 24 >/dev/null
fi
cd "$ROOT"
PORT=3001 pnpm --filter @services/notification start &
notif=$!
trap 'kill "$notif" 2>/dev/null || true' EXIT
until curl -sf http://127.0.0.1:3001/health >/dev/null; do sleep 0.2; done
PORT=3000 NOTIFICATION_URL=http://127.0.0.1:3001/instructions pnpm --filter @services/checkout start
