from pathlib import Path
import json
from tempfile import NamedTemporaryFile

from health_agent.assemble import assert_scores_unchanged
from health_agent.models import AnalysisPayload
from health_agent.run import produce_health_read
from health_agent.score_bridge import repo_root, score_payload


def test_agent_does_not_change_scores() -> None:
    payload_path = (
        repo_root() / "health" / "scoring" / "fixtures" / "rule-3-violation.json"
    )
    scores = score_payload(payload_path)
    read = produce_health_read(payload_path)
    assert_scores_unchanged(scores, read)
    boundary = next(item for item in read.characteristics if item.id == "boundary-integrity")
    assert boundary.score == 80
    assert boundary.recommendations
    payload = AnalysisPayload.model_validate_json(Path(payload_path).read_text())
    assert payload.runtime.callGraph is not None
    assert payload.runtime.callGraph.illustrative is False
    assert any(item.illustrative for item in payload.runtime.signals)
    assert "illustrative" in boundary.reasoning


def test_produce_health_read_accepts_runtime_edges() -> None:
    payload_path = (
        repo_root() / "health" / "scoring" / "fixtures" / "zero-findings.json"
    )
    payload = json.loads(payload_path.read_text())
    payload["runtime"]["callGraph"] = {
        "illustrative": False,
        "synthetic": True,
        "description": "synthetic smoke",
        "window": {
            "start": "2026-01-01T00:00:00.000Z",
            "end": "2026-01-01T00:30:00.000Z",
        },
        "traffic": "this-run",
        "queried": True,
        "edges": [
            {
                "from": "checkout",
                "to": "inventory",
                "protocol": "http",
                "count": 1,
            }
        ],
    }
    payload["runtime"]["vsImports"] = {
        "runtimeOnly": [
            {"from": "checkout", "to": "inventory", "protocol": "http"}
        ],
        "importOnly": [],
    }
    with NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
        handle.write(json.dumps(payload))
        temp = Path(handle.name)
    try:
        scores = score_payload(temp)
        read = produce_health_read(temp)
        assert_scores_unchanged(scores, read)
        assert any(
            "checkout -> inventory" in item.reasoning
            for item in read.characteristics
        )
    finally:
        temp.unlink(missing_ok=True)
