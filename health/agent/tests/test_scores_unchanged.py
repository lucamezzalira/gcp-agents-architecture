from pathlib import Path

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
    assert boundary.score == 60
    assert boundary.recommendations
    payload = AnalysisPayload.model_validate_json(Path(payload_path).read_text())
    assert payload.runtime.illustrative is True
    assert "illustrative" in boundary.reasoning
