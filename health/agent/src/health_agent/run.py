from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from health_agent.assemble import assemble, assert_scores_unchanged
from health_agent.models import AnalysisPayload, HealthRead
from health_agent.reasoner import Reasoner, StubReasoner
from health_agent.score_bridge import repo_root, score_payload


def choose_reasoner() -> Reasoner:
    if os.environ.get("HEALTH_REASONER", "stub") == "adk":
        from health_agent.adk_reasoner import AdkReasoner

        return AdkReasoner()
    return StubReasoner()


def load_file_priors() -> list[HealthRead]:
    reads: list[HealthRead] = []
    seen: set[str] = set()
    for folder in ("wave-2-reads", "wave-3-reads"):
        directory = repo_root() / "analysis" / folder
        if not directory.is_dir():
            continue
        for path in sorted(directory.glob("*.json")):
            read = HealthRead.model_validate_json(path.read_text())
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
) -> HealthRead:
    payload = AnalysisPayload.model_validate_json(payload_path.read_text())
    scores = score_payload(payload_path, decisions_path)
    priors = prior_reads if prior_reads is not None else load_file_priors()
    narratives = (reasoner or choose_reasoner()).reason(payload, scores, priors)
    read = assemble(payload.runId, payload.commitSha, scores, narratives)
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
