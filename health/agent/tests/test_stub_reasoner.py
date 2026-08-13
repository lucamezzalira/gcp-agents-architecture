from health_agent.models import AnalysisPayload, ScoreResult
from health_agent.reasoner import StubReasoner


def test_perfect_score_has_no_recommendations() -> None:
    payload = AnalysisPayload.model_validate(
        {
            "runId": "r",
            "commitSha": "a" * 40,
            "commitMessage": "ok",
            "timestamp": "2026-01-01T00:00:00.000Z",
            "archTests": [],
            "runtime": {"illustrative": True, "signals": []},
        }
    )
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
    narratives = StubReasoner().reason(payload, scores)
    assert all(item.recommendations == [] for item in narratives)
