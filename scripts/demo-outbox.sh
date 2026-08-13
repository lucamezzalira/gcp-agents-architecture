#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAST="$ROOT/.local/last-demo-order"

explicit_checkout="${CHECKOUT_URL:-}"
explicit_message="${MESSAGE_ID:-}"
explicit_order="${ORDER_ID:-}"
explicit_notification="${NOTIFICATION_URL:-}"

if [[ -f "$LAST" ]]; then
  # shellcheck disable=SC1090
  . "$LAST"
fi

if [[ -n "$explicit_checkout" ]]; then CHECKOUT_URL="$explicit_checkout"; fi
if [[ -n "$explicit_message" ]]; then MESSAGE_ID="$explicit_message"; fi
if [[ -n "$explicit_order" ]]; then ORDER_ID="$explicit_order"; fi
if [[ -n "$explicit_notification" ]]; then NOTIFICATION_URL="$explicit_notification"; fi

CHECKOUT_URL="${CHECKOUT_URL:-https://checkout-iqcdekwluq-ew.a.run.app}"
NOTIFICATION_URL="${NOTIFICATION_URL:-}"
PROJECT_ID="${PROJECT_ID:-ga-services-mezzalab}"
FIRESTORE_DATABASE="${FIRESTORE_DATABASE:-notification}"
MESSAGE_ID="${MESSAGE_ID:-}"
ORDER_ID="${ORDER_ID:-}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-30}"

if [[ -z "$MESSAGE_ID" && -n "$ORDER_ID" ]]; then
  MESSAGE_ID="checkout:${ORDER_ID}:paid"
fi
if [[ -z "$MESSAGE_ID" ]]; then
  echo "set MESSAGE_ID or ORDER_ID, or run ./scripts/demo-order.sh first" >&2
  exit 1
fi
if [[ -z "$ORDER_ID" && "$MESSAGE_ID" == checkout:*:paid ]]; then
  ORDER_ID="${MESSAGE_ID#checkout:}"
  ORDER_ID="${ORDER_ID%:paid}"
fi

use_local=0
if [[ -n "$NOTIFICATION_URL" ]]; then
  use_local=1
elif [[ "$CHECKOUT_URL" == *127.0.0.1* || "$CHECKOUT_URL" == *localhost* ]]; then
  use_local=1
  NOTIFICATION_URL="${NOTIFICATION_URL:-http://127.0.0.1:3001}"
fi

token=""
encoded=""
if [[ "$use_local" -eq 0 ]]; then
  token="$(gcloud auth print-access-token)"
  encoded="$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$MESSAGE_ID")"
fi

deadline=$((SECONDS + TIMEOUT_SECONDS))
while (( SECONDS < deadline )); do
  if [[ "$use_local" -eq 1 ]]; then
    sent="$(curl -sS "${NOTIFICATION_URL}/sent" || true)"
    if printf '%s' "$sent" | python3 -c '
import json, sys
order_id = sys.argv[1]
raw = sys.stdin.read()
if not raw.strip():
    raise SystemExit(1)
try:
    payload = json.loads(raw)
except json.JSONDecodeError:
    raise SystemExit(1)
needle = f"Order {order_id} confirmed"
for item in payload.get("sent") or []:
    if item.get("subject") == needle:
        print(json.dumps(item, indent=2))
        raise SystemExit(0)
raise SystemExit(1)
' "$ORDER_ID"
    then
      exit 0
    fi
  else
    url="https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${FIRESTORE_DATABASE}/documents/deliveries/${encoded}"
    doc="$(curl -sS -H "Authorization: Bearer ${token}" "$url" || true)"
    if printf '%s' "$doc" | python3 -c '
import json, sys
message_id = sys.argv[1]
raw = sys.stdin.read()
if not raw.strip():
    raise SystemExit(1)
try:
    payload = json.loads(raw)
except json.JSONDecodeError:
    raise SystemExit(1)
if payload.get("error"):
    raise SystemExit(1)
print(json.dumps({"messageId": message_id, "document": payload}, indent=2))
' "$MESSAGE_ID"
    then
      exit 0
    fi
  fi
  sleep 1
done

echo "timed out after ${TIMEOUT_SECONDS}s waiting for ${MESSAGE_ID}" >&2
exit 1
