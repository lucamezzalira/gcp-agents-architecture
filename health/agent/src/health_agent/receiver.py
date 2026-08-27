from __future__ import annotations

import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any

from health_agent.assemble import assemble, assert_scores_unchanged
from health_agent.host import fetch_engine_identity
from health_agent.models import AnalysisPayload, ScoreResult
from health_agent.narratives import empty_narratives, narratives_from_agent
from health_agent.persist import (
    attach_reasoning,
    connect,
    insert_health_read,
    iso_or_none,
    load_active_decisions,
    load_recent_reads,
    load_score_result,
    migrate,
)
from health_agent.reason_queue import publish_reason_job, reason_topic
from health_agent.reasoner_facts import metrics_from_payload
from health_agent.runtime_client import invoke_runtime
from health_agent.score_bridge import score_payload
from health_agent.tracing import current_trace_id, setup_tracing, tracer


def receive_payload(payload: dict[str, Any]) -> str:
    """Score and persist. Enqueue prose, or attach it inline when REASON_TOPIC is unset."""
    setup_tracing()
    parsed = AnalysisPayload.model_validate(payload)
    with tracer().start_as_current_span("receive_payload") as span:
        span.set_attribute("run.id", parsed.runId)
        span.set_attribute("commit.sha", parsed.commitSha)
        run_id, scores, priors = _score_and_insert(parsed, payload)
        prior_dicts = [
            item.model_dump(by_alias=True, exclude_none=True) for item in priors
        ]
        score_dump = scores.model_dump(by_alias=True)
        if reason_topic():
            with tracer().start_as_current_span("enqueue_reason"):
                publish_reason_job(run_id, payload, score_dump, prior_dicts)
            return run_id
        attach_runtime_reasoning(run_id, payload, scores, prior_dicts)
        return run_id


def reason_scored_run(body: dict[str, Any]) -> str:
    """Attach Agent Runtime prose to an already-scored row. Never rescores."""
    setup_tracing()
    run_id = str(body["runId"])
    payload = body["payload"]
    if not isinstance(payload, dict):
        raise ValueError("reason job payload must be an object")
    scores = ScoreResult.model_validate(body["scores"])
    raw_priors = body.get("priorReads")
    prior_dicts = (
        [item for item in raw_priors if isinstance(item, dict)]
        if isinstance(raw_priors, list)
        else []
    )
    with tracer().start_as_current_span("reason_scored_run") as span:
        span.set_attribute("run.id", run_id)
        return attach_runtime_reasoning(run_id, payload, scores, prior_dicts)


def _score_and_insert(
    parsed: AnalysisPayload, payload: dict[str, Any]
) -> tuple[str, ScoreResult, list[Any]]:
    with NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
        handle.write(parsed.model_dump_json(by_alias=True, exclude_none=True))
        path = Path(handle.name)
    decisions_path: Path | None = None
    conn = None
    try:
        conn = connect()
        migrate(conn)
        decisions = load_active_decisions(conn)
        with NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            handle.write(json.dumps(decisions))
            decisions_path = Path(handle.name)
        priors = load_recent_reads(conn)
        conn.commit()
        with tracer().start_as_current_span("scoring"):
            scores = score_payload(path, decisions_path)
        scored = assemble(
            parsed.runId,
            parsed.commitSha,
            scores,
            empty_narratives(scores),
            reasoner="",
            trace_id=current_trace_id(),
        )
        scored = scored.model_copy(
            update={
                "metrics": metrics_from_payload(parsed),
                "ruleSetVersion": parsed.ruleSetVersion,
            }
        )
        run_id = insert_health_read(
            conn,
            scored,
            parsed.commitMessage,
            iso_or_none(parsed.committedAt),
        )
        if run_id.reused_incomplete:
            scores = load_score_result(conn, run_id.run_id)
        return run_id.run_id, scores, priors
    finally:
        if conn is not None:
            conn.close()
        path.unlink(missing_ok=True)
        if decisions_path is not None:
            decisions_path.unlink(missing_ok=True)


def attach_runtime_reasoning(
    run_id: str,
    payload: dict[str, Any],
    scores: ScoreResult,
    prior_reads: list[dict[str, Any]],
) -> str:
    conn = None
    try:
        conn = connect()
        try:
            output = invoke_runtime(
                payload,
                scores=scores.model_dump(by_alias=True),
                prior_reads=prior_reads,
            )
        except Exception as exc:
            print(f"reasoning_failed={type(exc).__name__}: {exc}", flush=True)
            raise
        narratives = narratives_from_agent(output, scores)
        identity = _optional_str(output.get("agentIdentity")) or _receiver_runtime_identity()
        read = assemble(
            run_id,
            str(payload.get("commitSha") or ""),
            scores,
            narratives,
            reasoner=str(output.get("reasoner") or "adk"),
            trace_id=current_trace_id(),
            model=_optional_str(output.get("model")),
            host=_optional_str(output.get("host")) or "agent-runtime",
            agent_identity=identity,
        )
        read = read.model_copy(update={"ruleSetVersion": int(payload.get("ruleSetVersion") or 1)})
        assert_scores_unchanged(scores, read)
        attach_reasoning(
            conn,
            run_id,
            narratives,
            reasoner=read.reasoner,
            host=read.host,
            model=read.model,
            agent_identity=read.agentIdentity,
            trace_id=read.traceId,
        )
        return run_id
    finally:
        if conn is not None:
            conn.close()


def _receiver_runtime_identity() -> str | None:
    return fetch_engine_identity(
        os.environ.get("AGENT_RUNTIME_ID", "").strip(),
        os.environ.get("AGENT_RUNTIME_LOCATION", "europe-west1"),
        os.environ.get("GOOGLE_CLOUD_PROJECT", "").strip(),
    )


def _optional_str(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return value
    return None
