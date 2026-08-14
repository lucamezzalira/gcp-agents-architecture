from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import TYPE_CHECKING

from health_agent.assemble import assemble, assert_scores_unchanged
from health_agent.memory import MemoryBank, observation_from_read
from health_agent.models import AnalysisPayload, HealthRead
from health_agent.reasoner_facts import (
    enrich_payload_with_priors,
    metrics_from_payload,
    prior_metrics_series,
)
from health_agent.reasoner import Reasoner, StubReasoner
from health_agent.score_bridge import repo_root, score_payload
from health_agent.tracing import current_trace_id, tracer
from health_agent.vertex_memory import choose_memory_bank

if TYPE_CHECKING:
    pass


def _import_adk_reasoner() -> type[Reasoner]:
    from health_agent.adk_reasoner import AdkReasoner

    return AdkReasoner


def reasoner_name(reasoner: Reasoner) -> str:
    return type(reasoner).__name__.removesuffix("Reasoner").lower()


def choose_reasoner() -> Reasoner:
    name = os.environ.get("HEALTH_REASONER", "").strip()
    if name == "stub":
        if os.environ.get("K_SERVICE"):
            raise RuntimeError("HEALTH_REASONER=stub is not allowed on Cloud Run")
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


def load_file_priors() -> list[HealthRead]:
    reads: list[HealthRead] = []
    seen: set[str] = set()
    for folder in ("wave-2-reads", "wave-3-reads"):
        directory = repo_root() / "analysis" / folder
        if not directory.is_dir():
            continue
        for path in sorted(directory.glob("*.json")):
            raw = json.loads(path.read_text())
            if "reasoner" not in raw:
                raw["reasoner"] = "stub"
            read = HealthRead.model_validate(raw)
            if read.commitSha in seen:
                continue
            seen.add(read.commitSha)
            reads.append(read)
    return reads


def produce_health_read(
    payload_path: Path,
    decisions_path: Path | None = None,
    reasoner: Reasoner | None = None,
    prior_reads: list[HealthRead] | None = None,
    memory: MemoryBank | None = None,
) -> HealthRead:
    payload = AnalysisPayload.model_validate_json(payload_path.read_text())
    selected = reasoner or choose_reasoner()
    name = reasoner_name(selected)
    bank = memory if memory is not None else choose_memory_bank()
    priors = prior_reads if prior_reads is not None else load_file_priors()
    query = (
        f"{payload.commitMessage}. "
        f"paths: services/checkout services/notification"
    )
    with tracer().start_as_current_span("health_run") as root:
        root.set_attribute("run.id", payload.runId)
        root.set_attribute("commit.sha", payload.commitSha)
        root.set_attribute("reasoner", name)
        enriched = enrich_payload_with_priors(payload, priors)
        with NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            handle.write(enriched.model_dump_json(by_alias=True, exclude_none=True))
            scored_path = Path(handle.name)
        try:
            with tracer().start_as_current_span("scoring"):
                scores = score_payload(scored_path, decisions_path)
        finally:
            scored_path.unlink(missing_ok=True)
        with tracer().start_as_current_span("memory_retrieve"):
            snippets = bank.retrieve(query)
        print(
            f"reasoner={name} memory_snippets={len(snippets)} "
            f"prior_metrics={len(prior_metrics_series(priors, payload.commitSha))} "
            f"changed_files={len(payload.changedFiles)} run={payload.runId}",
            flush=True,
        )
        with tracer().start_as_current_span("reasoning"):
            narratives = selected.reason(
                payload,
                scores,
                priors,
                memory_snippets=snippets,
            )
        read = assemble(
            payload.runId,
            payload.commitSha,
            scores,
            narratives,
            reasoner=name,
            trace_id=current_trace_id(),
        )
        read = read.model_copy(
            update={
                "metrics": metrics_from_payload(payload),
                "ruleSetVersion": payload.ruleSetVersion,
            }
        )
        assert_scores_unchanged(scores, read)
        layering = next(
            item.reasoning for item in read.characteristics if item.id == "layering"
        )
        with tracer().start_as_current_span("memory_write"):
            bank.write(
                observation_from_read(read.commitSha, read.overall, layering),
                {"runId": read.runId, "commitSha": read.commitSha},
            )
        return read


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("payload")
    parser.add_argument("decisions", nargs="?")
    parser.add_argument("--write", dest="write")
    args = parser.parse_args()
    read = produce_health_read(
        Path(args.payload),
        Path(args.decisions) if args.decisions else None,
    )
    text = json.dumps(read.model_dump(exclude_none=True), indent=2)
    if args.write:
        Path(args.write).write_text(text + "\n")
    else:
        print(text)


if __name__ == "__main__":
    main()
