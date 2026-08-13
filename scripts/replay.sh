#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  nvm use 24 >/dev/null
fi

docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U health >/dev/null 2>&1; do
  sleep 1
done

PYTHON="$ROOT/health/agent/.venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  echo "create the agent venv first: python3 -m venv health/agent/.venv && health/agent/.venv/bin/pip install -e 'health/agent/.[dev]'"
  exit 1
fi
"$PYTHON" -m health_agent.replay
