#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHECKOUT_URL="${CHECKOUT_URL:-https://checkout-iqcdekwluq-ew.a.run.app}"
EMAIL="${EMAIL:-buyer@example.com}"
ORDER_ID="${ORDER_ID:-ord-$(date +%s)}"
PAY_ATTEMPTS="${PAY_ATTEMPTS:-20}"
PAY_SLEEP_SECS="${PAY_SLEEP_SECS:-0.5}"

post() {
  local path="$1"
  local payload="${2:-}"
  local body http
  body="$(mktemp)"
  if [[ -n "$payload" ]]; then
    http="$(curl -sS -o "$body" -w '%{http_code}' -X POST "${CHECKOUT_URL}${path}" \
      -H 'content-type: application/json' \
      -d "$payload")"
  else
    http="$(curl -sS -o "$body" -w '%{http_code}' -X POST "${CHECKOUT_URL}${path}")"
  fi
  if [[ "$http" != 2* ]]; then
    echo "POST ${path} failed (${http}): $(cat "$body")" >&2
    rm -f "$body"
    exit 1
  fi
  cat "$body"
  rm -f "$body"
}

# Cloud pay waits for the reservation-outcomes push. Local MemoryReservationPublisher
# records reserved in-process, so pay succeeds on the first try. On GCP, POST /pay
# returns 409 reservation not ready until inventory publishes; this loop retries.
pay_with_retry() {
  local path="/orders/${ORDER_ID}/pay"
  local attempt=1
  local body http
  while (( attempt <= PAY_ATTEMPTS )); do
    body="$(mktemp)"
    http="$(curl -sS -o "$body" -w '%{http_code}' -X POST "${CHECKOUT_URL}${path}")"
    if [[ "$http" == 2* ]]; then
      cat "$body"
      rm -f "$body"
      return 0
    fi
    if [[ "$http" == "409" ]] && grep -q 'reservation not ready' "$body"; then
      rm -f "$body"
      sleep "$PAY_SLEEP_SECS"
      attempt=$((attempt + 1))
      continue
    fi
    echo "POST ${path} failed (${http}): $(cat "$body")" >&2
    rm -f "$body"
    exit 1
  done
  echo "POST ${path} still not ready after ${PAY_ATTEMPTS} attempts" >&2
  exit 1
}

create_json="$(post /orders "{\"id\":\"${ORDER_ID}\",\"email\":\"${EMAIL}\"}")"
echo "$create_json"
pay_json="$(pay_with_retry)"
echo "$pay_json"

mkdir -p "$ROOT/.local"
printf '%s' "$pay_json" | python3 -c '
import json, sys
path, checkout_url, order_id = sys.argv[1], sys.argv[2], sys.argv[3]
payload = json.load(sys.stdin)
instruction = payload.get("instruction") or {}
message_id = instruction.get("messageId", f"checkout:{order_id}:paid")
with open(path, "w", encoding="utf-8") as handle:
    handle.write(f"CHECKOUT_URL={checkout_url}\n")
    handle.write(f"ORDER_ID={order_id}\n")
    handle.write(f"MESSAGE_ID={message_id}\n")
' "$ROOT/.local/last-demo-order" "$CHECKOUT_URL" "$ORDER_ID"
