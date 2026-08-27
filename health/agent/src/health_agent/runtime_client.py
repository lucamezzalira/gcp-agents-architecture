from __future__ import annotations

import json
import os
from typing import Any

import google.auth
from google.auth.transport.requests import AuthorizedSession

from health_agent.models import AnalysisPayload, ScoreResult
from health_agent.settings import (
    DEFAULT_RUNTIME_LOCATION,
    RUNTIME_QUERY_TIMEOUT_S,
)


def runtime_query_url() -> str:
    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
    location = os.environ.get(
        "AGENT_RUNTIME_LOCATION",
        os.environ.get("GOOGLE_CLOUD_LOCATION", DEFAULT_RUNTIME_LOCATION),
    )
    engine_id = os.environ.get("AGENT_RUNTIME_ID", "").strip()
    if not project or not engine_id:
        raise RuntimeError("AGENT_RUNTIME_ID and GOOGLE_CLOUD_PROJECT are required")
    return (
        f"https://{location}-aiplatform.googleapis.com/v1/"
        f"projects/{project}/locations/{location}/reasoningEngines/{engine_id}:query"
    )


def invoke_runtime(
    payload: dict[str, Any],
    scores: dict[str, Any] | ScoreResult | None = None,
    prior_reads: list[dict[str, Any]] | None = None,
    persist: bool = False,
) -> dict[str, Any]:
    del persist
    AnalysisPayload.model_validate(payload)
    if isinstance(scores, ScoreResult):
        score_payload = scores.model_dump(by_alias=True)
    elif isinstance(scores, dict):
        ScoreResult.model_validate(scores)
        score_payload = scores
    else:
        raise ValueError("scores are required; the receiver computes them")
    # QueryReasoningEngine returns ACCESS_TOKEN_SCOPE_INSUFFICIENT for the
    # aiplatform OAuth scope. IAM on this SA is the custom query role, not
    # Vertex User. The token still needs cloud-platform.
    creds, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    session = AuthorizedSession(creds)
    response = session.post(
        runtime_query_url(),
        json={
            "class_method": "query",
            "input": {
                "payload": payload,
                "scores": score_payload,
                "prior_reads": prior_reads or [],
            },
        },
        timeout=RUNTIME_QUERY_TIMEOUT_S,
    )
    if response.status_code >= 400:
        raise RuntimeError(
            f"Agent Runtime query failed: {response.status_code} {response.text}"
        )
    body = response.json()
    output = body.get("output", body)
    if not isinstance(output, dict):
        raise RuntimeError("Agent Runtime returned a non-object output")
    return output
