from __future__ import annotations

import base64
import json
import os
from typing import Any

from health_agent.models import AnalysisPayload, ScoreResult
from health_agent.narratives import priors_from_dicts, scores_from_dict
from health_agent.pubsub_envelope import decode_pubsub_data
from health_agent.settings import REASON_PUBLISH_TIMEOUT_S


def reason_topic() -> str:
    return os.environ.get("REASON_TOPIC", "").strip()


def encode_reason_job(
    run_id: str,
    payload: dict[str, Any],
    scores: dict[str, Any],
    prior_reads: list[dict[str, Any]],
) -> dict[str, Any]:
    AnalysisPayload.model_validate(payload)
    ScoreResult.model_validate(scores)
    return {
        "runId": run_id,
        "payload": payload,
        "scores": scores,
        "priorReads": prior_reads,
    }


def decode_reason_job(raw: bytes) -> dict[str, Any]:
    body = decode_pubsub_data(raw)
    if not isinstance(body, dict):
        raise ValueError("reason job is not an object")
    run_id = body.get("runId")
    payload = body.get("payload")
    scores = body.get("scores")
    if not isinstance(run_id, str) or not run_id:
        raise ValueError("reason job is missing runId")
    if not isinstance(payload, dict):
        raise ValueError("reason job is missing payload")
    AnalysisPayload.model_validate(payload)
    scored = scores_from_dict(scores)
    priors = priors_from_dicts(body.get("priorReads"))
    return {
        "runId": run_id,
        "payload": payload,
        "scores": scored.model_dump(by_alias=True),
        "priorReads": [
            item.model_dump(by_alias=True, exclude_none=True) for item in priors
        ],
    }


def publish_reason_job(
    run_id: str,
    payload: dict[str, Any],
    scores: dict[str, Any],
    prior_reads: list[dict[str, Any]],
) -> None:
    topic = reason_topic()
    if not topic:
        raise RuntimeError("REASON_TOPIC is unset")
    body = encode_reason_job(run_id, payload, scores, prior_reads)
    encoded = base64.b64encode(json.dumps(body).encode("utf-8")).decode("ascii")
    import google.auth
    from google.auth.transport.requests import AuthorizedSession

    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/pubsub"])
    session = AuthorizedSession(creds)
    url = f"https://pubsub.googleapis.com/v1/{topic}:publish"
    response = session.post(
        url,
        json={"messages": [{"data": encoded}]},
        timeout=REASON_PUBLISH_TIMEOUT_S,
    )
    if response.status_code >= 400:
        raise RuntimeError(
            f"reason publish failed: {response.status_code} {response.text}"
        )
