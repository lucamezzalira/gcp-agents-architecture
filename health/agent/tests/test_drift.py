from health_agent.models import AnalysisPayload, HealthRead, ScoreResult
from health_agent.reasoner import StubReasoner


def _payload(**overrides: object) -> AnalysisPayload:
    data: dict[str, object] = {
        "runId": "r",
        "commitSha": "a" * 40,
        "commitMessage": "Add a delivery metrics endpoint to notification.",
        "timestamp": "2026-01-01T00:00:00.000Z",
        "archTests": [
            {"ruleId": f"rule-{n}", "passed": True, "violations": []}
            for n in range(1, 6)
        ],
        "dependencyCruiser": {
            "cycles": [],
            "orphans": [],
            "violations": [],
            "metrics": {"modules": 82, "dependencies": 110},
        },
        "duplication": {"clones": [], "percentage": 5.4},
        "runtime": {"illustrative": True, "signals": []},
        "recentCommits": [
            {
                "sha": "b" * 40,
                "message": "Add a delivery metrics endpoint to notification.",
            },
            {
                "sha": "c" * 40,
                "message": "Route expedited confirmations through send instructions again.",
            },
        ],
    }
    data.update(overrides)
    return AnalysisPayload.model_validate(data)


def _scores(**overrides: int) -> ScoreResult:
    values = {
        "boundary-integrity": 100,
        "layering": 100,
        "coupling": 100,
        "duplication": 100,
        **overrides,
    }
    return ScoreResult.model_validate(
        {
            "overall": 100,
            "characteristics": [
                {"id": key, "score": value, "signalsUsed": []}
                for key, value in values.items()
            ],
        }
    )


def _prior() -> HealthRead:
    return HealthRead.model_validate(
        {
            "runId": "p",
            "commitSha": "d" * 40,
            "overall": 100,
            "characteristics": [
                {
                    "id": "layering",
                    "score": 100,
                    "reasoning": "ok",
                    "recommendations": [],
                    "signalsUsed": [],
                }
            ],
        }
    )


def _by_id(payload: AnalysisPayload, scores: ScoreResult, priors: list[HealthRead] | None = None):
    return {
        item.id: item
        for item in StubReasoner().reason(payload, scores, priors)
    }


def test_no_priors_does_not_scare_about_pass_through() -> None:
    narratives = _by_id(_payload(), _scores(), [])
    assert "forwards a query" not in narratives["layering"].reasoning
    assert "No deterministic findings applied." in narratives["layering"].reasoning
    assert all(item.recommendations == [] for item in narratives.values())


def test_with_priors_layering_names_the_tool_gap() -> None:
    layering = _by_id(_payload(), _scores(), [_prior()])["layering"]
    assert "forwards a query" in layering.reasoning
    assert "getDeliveryStats" not in layering.reasoning
    assert layering.recommendations == []


def test_coupling_connects_recent_commits_when_history_exists() -> None:
    coupling = _by_id(_payload(), _scores(), [_prior()])["coupling"]
    assert "82 modules" in coupling.reasoning
    assert "110 dependencies" in coupling.reasoning
    assert "sequence" in coupling.reasoning
    assert "Add a delivery metrics endpoint" in coupling.reasoning


def test_within_service_clones_are_not_the_accepted_split() -> None:
    payload = _payload(
        duplication={
            "percentage": 8.2,
            "clones": [
                {
                    "files": [
                        "services/checkout/src/domain/render-confirmation.ts",
                        "services/checkout/src/domain/render-welcome-confirmation.ts",
                    ],
                    "lines": 20,
                    "tokens": 80,
                }
            ],
        }
    )
    duplication = _by_id(payload, _scores(duplication=85), [_prior()])["duplication"]
    assert "single service" in duplication.reasoning
    assert "render-welcome-confirmation.ts" in duplication.reasoning
    assert "deliberate" not in duplication.reasoning
    assert duplication.recommendations == []


def test_cross_service_clones_stay_accepted() -> None:
    payload = _payload(
        duplication={
            "percentage": 5.4,
            "clones": [
                {
                    "files": [
                        "services/checkout/src/domain/send-instruction.ts",
                        "services/notification/src/domain/send-instruction.ts",
                    ],
                    "lines": 7,
                    "tokens": 50,
                }
            ],
        }
    )
    duplication = _by_id(payload, _scores(), [_prior()])["duplication"]
    assert "deliberate" in duplication.reasoning
    assert "single service" not in duplication.reasoning


def test_refund_commit_calls_the_contract_under_pressure() -> None:
    payload = _payload(
        commitMessage="Send a refund confirmation through notification.",
        recentCommits=[
            {
                "sha": "e" * 40,
                "message": "Send a refund confirmation through notification.",
            },
            {
                "sha": "f" * 40,
                "message": "Add a delivery metrics endpoint to notification.",
            },
        ],
    )
    boundary = _by_id(payload, _scores(), [_prior()])["boundary-integrity"]
    assert "boundary is holding" in boundary.reasoning
    assert "contract is the thing under pressure" in boundary.reasoning
    assert boundary.recommendations == []
