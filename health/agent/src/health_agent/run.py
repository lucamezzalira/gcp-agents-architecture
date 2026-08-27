from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import TYPE_CHECKING

from health_agent.assemble import assemble, assert_scores_unchanged
from health_agent.host import resolve_model, resolved_host, resolved_identity
from health_agent.memory import MemoryBank
from health_agent.models import AnalysisPayload, HealthRead
from health_agent.reason import choose_reasoner, reason_over_scores, reasoner_name
from health_agent.reasoner import Reasoner
from health_agent.reasoner_facts import enrich_payload_with_priors, metrics_from_payload
from health_agent.score_bridge import repo_root, score_payload
from health_agent.tracing import setup_tracing, tracer

if TYPE_CHECKING:
    pass


def load_file_priors() -> list[HealthRead]:
    """Wave fixture priors are opt-in. Set HEALTH_FILE_PRIORS=1 to load analysis/wave-*."""
    if os.environ.get("HEALTH_FILE_PRIORS", "").strip() != "1":
        return []
    reads: list[HealthRead] = []
    seen: set[str] = set()
    for folder in ("wave-2-reads", "wave-3-reads", "wave-5-reads"):
        directory = repo_root() / "analysis" / folder
        if not directory.is_dir():
            continue
        for path in sorted(directory.glob("*.json")):
            raw = json.loads(path.read_text())
            if "reasoner" not in raw:
                raw["reasoner"] = "stub"
            try:
                read = HealthRead.model_validate(raw)
            except Exception:
                continue
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
    priors = prior_reads if prior_reads is not None else load_file_priors()
    setup_tracing()
    enriched = enrich_payload_with_priors(payload, priors)
    with NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
        handle.write(enriched.model_dump_json(by_alias=True, exclude_none=True))
        scored_path = Path(handle.name)
    try:
        with tracer().start_as_current_span("scoring"):
            scores = score_payload(scored_path, decisions_path)
    finally:
        scored_path.unlink(missing_ok=True)
    narratives, provenance = reason_over_scores(
        payload,
        scores,
        selected,
        prior_reads=priors,
        memory=memory,
    )
    read = assemble(
        payload.runId,
        payload.commitSha,
        scores,
        narratives,
        reasoner=name,
        trace_id=provenance.get("traceId") if isinstance(provenance.get("traceId"), str) else None,
        model=resolve_model() if name == "adk" else None,
        host=resolved_host(),
        agent_identity=resolved_identity(),
    )
    read = read.model_copy(
        update={
            "metrics": metrics_from_payload(payload),
            "ruleSetVersion": payload.ruleSetVersion,
        }
    )
    assert_scores_unchanged(scores, read)
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
