from health_agent.models import AnalysisPayload, ScoreResult
from health_agent.reasoner import StubReasoner


def _payload(arch_tests: list[dict]) -> AnalysisPayload:
    return AnalysisPayload.model_validate(
        {
            "runId": "r",
            "commitSha": "a" * 40,
            "commitMessage": "ok",
            "timestamp": "2026-01-01T00:00:00.000Z",
            "archTests": arch_tests,
            "runtime": {"illustrative": True, "signals": []},
        }
    )


def _scores(boundary: int, signals: list[str]) -> ScoreResult:
    return ScoreResult.model_validate(
        {
            "overall": 84,
            "characteristics": [
                {
                    "id": "boundary-integrity",
                    "score": boundary,
                    "signalsUsed": signals,
                },
                {"id": "layering", "score": 100, "signalsUsed": []},
                {"id": "coupling", "score": 100, "signalsUsed": []},
                {"id": "duplication", "score": 100, "signalsUsed": []},
            ],
        }
    )


def test_perfect_score_has_no_recommendations() -> None:
    narratives = StubReasoner().reason(_payload([]), _scores(100, []))
    assert all(item.recommendations == [] for item in narratives)


def test_rule_3_names_the_provider_bypass() -> None:
    payload = _payload(
        [
            {
                "ruleId": "rule-3",
                "passed": False,
                "violations": [
                    {
                        "file": "services/checkout/src/app.ts",
                        "detail": "depends on email-provider",
                    }
                ],
            }
        ]
    )
    boundary = next(
        item
        for item in StubReasoner().reason(payload, _scores(60, ["ts-arch:rule-3"]))
        if item.id == "boundary-integrity"
    )
    assert "email provider client" in boundary.reasoning
    assert "send instruction" in boundary.reasoning.lower()
    assert any("priority" in item for item in boundary.recommendations)
    assert not any(
        "do not import the provider" in item.lower()
        for item in boundary.recommendations
    )


def test_rule_3_and_rule_4_are_named_separately() -> None:
    payload = _payload(
        [
            {
                "ruleId": "rule-3",
                "passed": False,
                "violations": [
                    {
                        "file": "services/checkout/src/app.ts",
                        "detail": "depends on email-provider",
                    }
                ],
            },
            {
                "ruleId": "rule-4",
                "passed": False,
                "violations": [
                    {
                        "file": "services/checkout/src/infrastructure/notification-delivery-store.ts",
                        "detail": "depends on delivery-store",
                    }
                ],
            },
        ]
    )
    boundary = next(
        item
        for item in StubReasoner().reason(
            payload, _scores(30, ["ts-arch:rule-3", "ts-arch:rule-4"])
        )
        if item.id == "boundary-integrity"
    )
    assert "email provider client" in boundary.reasoning
    assert "delivery records" in boundary.reasoning
    assert any("SendInstruction" in item or "send instruction" in item.lower() for item in boundary.recommendations)
    assert any("Firestore" in item for item in boundary.recommendations)
