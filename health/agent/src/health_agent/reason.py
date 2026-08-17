from __future__ import annotations

import json
import os
import sys
import traceback
from typing import Any

from health_agent.host import hosted_in_cloud, resolve_model, resolved_host, resolved_identity
from health_agent.memory import (
    MemoryBank,
    keep_structured_records,
    memory_retrieve_query,
    observation_from_scores,
)
from health_agent.models import AnalysisPayload, HealthRead, Narrative, ScoreResult
from health_agent.reasoner import Reasoner, StubReasoner
from health_agent.reasoner_facts import prior_metrics_series
from health_agent.tracing import current_trace_id, setup_tracing, tracer
from health_agent.vertex_memory import choose_memory_bank


def reasoner_name(reasoner: Reasoner) -> str:
    return type(reasoner).__name__.removesuffix("Reasoner").lower()


def _import_adk_reasoner() -> type[Reasoner]:
    from health_agent.adk_reasoner import AdkReasoner

    return AdkReasoner


def choose_reasoner() -> Reasoner:
    name = os.environ.get("HEALTH_REASONER", "").strip()
    if name == "stub":
        if hosted_in_cloud():
            raise RuntimeError("HEALTH_REASONER=stub is not allowed in cloud")
        return StubReasoner()
    if name == "adk":
        try:
            cls = _import_adk_reasoner()
        except ImportError as exc:
            raise RuntimeError(
                "HEALTH_REASONER=adk but google-adk is not importable"
            ) from exc
        return cls()
    raise RuntimeError(
        f"HEALTH_REASONER must be 'adk' or 'stub', got {name!r}"
    )


def reason_over_scores(
    payload: AnalysisPayload,
    scores: ScoreResult,
    reasoner: Reasoner,
    prior_reads: list[HealthRead] | None = None,
    memory: MemoryBank | None = None,
) -> tuple[list[Narrative], dict[str, Any]]:
    """Reason over scores that were already computed. Does not call health/scoring."""
    name = reasoner_name(reasoner)
    bank = memory if memory is not None else choose_memory_bank()
    priors = prior_reads if prior_reads is not None else []
    setup_tracing()
    query = memory_retrieve_query(payload)
    with tracer().start_as_current_span("health_run") as root:
        root.set_attribute("run.id", payload.runId)
        root.set_attribute("commit.sha", payload.commitSha)
        root.set_attribute("reasoner", name)
        root.set_attribute("host", resolved_host())
        root.set_attribute("model", resolve_model() if name == "adk" else "none")
        with tracer().start_as_current_span("memory_retrieve"):
            raw_snippets = bank.retrieve(query)
        kept = keep_structured_records(raw_snippets)
        print(
            f"reasoner={name} memory_snippets={len(raw_snippets)} "
            f"memory_structured={len(kept)} "
            f"memory_query={query!r} "
            f"prior_metrics={len(prior_metrics_series(priors, payload.commitSha))} "
            f"changed_files={len(payload.changedFiles)} run={payload.runId}",
            flush=True,
        )
        print("memory_retrieved_raw=" + json.dumps(raw_snippets), flush=True)
        print("memory_retrieved_kept=" + json.dumps(kept), flush=True)
        with tracer().start_as_current_span("reasoning"):
            narratives = reasoner.reason(
                payload,
                scores,
                priors,
                memory_snippets=kept,
            )
        previous = None
        for item in reversed(priors):
            if item.commitSha != payload.commitSha:
                previous = item
                break
        with tracer().start_as_current_span("memory_write"):
            try:
                bank.write(
                    observation_from_scores(payload.commitSha, scores, previous),
                    {"runId": payload.runId, "commitSha": payload.commitSha},
                )
            except Exception as exc:
                print(
                    f"memory_write_failed={type(exc).__name__}: {exc}",
                    file=sys.stderr,
                    flush=True,
                )
                traceback.print_exc(file=sys.stderr)
        provenance = {
            "reasoner": name,
            "traceId": current_trace_id(),
            "model": resolve_model() if name == "adk" else None,
            "host": resolved_host(),
            "agentIdentity": resolved_identity(),
        }
        return narratives, provenance


def agent_output(
    narratives: list[Narrative], provenance: dict[str, Any]
) -> dict[str, Any]:
    return {
        "narratives": [
            item.model_dump(by_alias=True, exclude_none=True) for item in narratives
        ],
        "reasoner": provenance.get("reasoner"),
        "traceId": provenance.get("traceId"),
        "model": provenance.get("model"),
        "host": provenance.get("host"),
        "agentIdentity": provenance.get("agentIdentity"),
    }
