from __future__ import annotations

import base64
import json
from typing import Any


def decode_pubsub_data(raw: bytes) -> Any:
    """Decode a Pub/Sub push envelope to the JSON payload in message.data."""
    envelope = json.loads(raw.decode("utf-8"))
    message = envelope.get("message", {})
    if not isinstance(message, dict):
        raise ValueError("Pub/Sub envelope is missing message")
    data = base64.b64decode(message["data"]).decode("utf-8")
    return json.loads(data)
