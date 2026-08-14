#!/usr/bin/env bash
# Synthetic smoke traffic for the runtime call graph.
# The resulting Cloud Trace edges are labelled synthetic wherever they are reported.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHECKOUT_URL="${CHECKOUT_URL:-https://checkout-iqcdekwluq-ew.a.run.app}"
INVENTORY_URL="${INVENTORY_URL:-https://inventory-iqcdekwluq-ew.a.run.app}"
EMAIL="${EMAIL:-buyer@example.com}"
ORDER_ID="${ORDER_ID:-ord-$(date +%s)}"
SKU="${SKU:-standard-item}"

echo "synthetic smoke: place an order, reserve stock, pay, send a confirmation, trigger a low-stock alert"

identity_token() {
  local audience="$1"
  # WIF and user ADC are not service accounts. --audiences only works when
  # gcloud mints the token by impersonating one (services-ci in GitHub Actions).
  local args=(--audiences="$audience" --quiet)
  if [[ -n "${SERVICES_CI_SA:-}" ]]; then
    args+=(--impersonate-service-account="$SERVICES_CI_SA" --include-email)
  fi
  gcloud auth print-identity-token "${args[@]}"
}

request() {
  local method="$1"
  local url="$2"
  local payload="${3:-}"
  local origin token
  origin="$(python3 -c 'from urllib.parse import urlparse; import sys; u=urlparse(sys.argv[1]); print(f"{u.scheme}://{u.netloc}")' "$url")"
  token="$(identity_token "$origin")"
  local body http
  body="$(mktemp)"
  if [[ -n "$payload" ]]; then
    http="$(curl -sS -o "$body" -w '%{http_code}' -X "$method" "$url" \
      -H 'content-type: application/json' \
      -H "Authorization: Bearer ${token}" \
      -d "$payload")"
  else
    http="$(curl -sS -o "$body" -w '%{http_code}' -X "$method" "$url" \
      -H "Authorization: Bearer ${token}")"
  fi
  if [[ "$http" != 2* ]]; then
    echo "${method} ${url} failed (${http}): $(cat "$body")" >&2
    rm -f "$body"
    exit 1
  fi
  cat "$body"
  echo
  rm -f "$body"
}

# Remaining 4 after a 1-unit reserve is below the ops threshold of 5.
request PUT "${INVENTORY_URL}/stock/${SKU}" "{\"available\":5}"

create_json="$(request POST "${CHECKOUT_URL}/orders" "{\"id\":\"${ORDER_ID}\",\"email\":\"${EMAIL}\"}")"
echo "$create_json"

sleep 2

pay_json="$(request POST "${CHECKOUT_URL}/orders/${ORDER_ID}/pay")"
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
    handle.write("SYNTHETIC=1\n")
' "$ROOT/.local/last-smoke-order" "$CHECKOUT_URL" "$ORDER_ID"

echo "synthetic smoke complete for ${ORDER_ID}"
