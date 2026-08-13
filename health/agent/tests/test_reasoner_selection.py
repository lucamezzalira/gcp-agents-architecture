import os
from pathlib import Path

import pytest

from health_agent.assemble import assemble
from health_agent.models import HealthRead, Narrative, ScoreResult
from health_agent.run import choose_reasoner, produce_health_read
from health_agent.score_bridge import repo_root


def test_choose_reasoner_does_not_fall_back_when_adk_import_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("HEALTH_REASONER", "adk")
    monkeypatch.delenv("K_SERVICE", raising=False)

    def boom() -> type:
        raise ImportError("google.adk missing")

    monkeypatch.setattr("health_agent.run._import_adk_reasoner", boom)
    with pytest.raises(RuntimeError, match="google-adk is not importable"):
        choose_reasoner()


def test_cloud_run_refuses_the_stub(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HEALTH_REASONER", "stub")
    monkeypatch.setenv("K_SERVICE", "health-agent")
    with pytest.raises(RuntimeError, match="not allowed on Cloud Run"):
        choose_reasoner()


def test_health_read_names_the_reasoner() -> None:
    scores = ScoreResult.model_validate(
        {
            "overall": 100,
            "characteristics": [
                {"id": "boundary-integrity", "score": 100, "signalsUsed": []},
                {"id": "layering", "score": 100, "signalsUsed": []},
                {"id": "coupling", "score": 100, "signalsUsed": []},
                {"id": "duplication", "score": 100, "signalsUsed": []},
            ],
        }
    )
    narratives = [
        Narrative(id=item.id, reasoning=f"{item.id} ok", recommendations=[])
        for item in scores.characteristics
    ]
    read = assemble("r", "a" * 40, scores, narratives, reasoner="adk", trace_id="abc")
    assert read.reasoner == "adk"
    assert read.traceId == "abc"


def test_produce_health_read_persists_reasoner_on_the_read() -> None:
    payload_path = (
        repo_root() / "health" / "scoring" / "fixtures" / "zero-findings.json"
    )
    read = produce_health_read(payload_path)
    assert isinstance(read, HealthRead)
    assert read.reasoner == "stub"
    assert Path(payload_path).exists()
