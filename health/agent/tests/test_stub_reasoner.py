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


def test_runtime_only_checkout_inventory_edge_is_named() -> None:
    payload = AnalysisPayload.model_validate(
        {
            "runId": "r",
            "commitSha": "a" * 40,
            "commitMessage": "ok",
            "timestamp": "2026-01-01T00:00:00.000Z",
            "archTests": [
                {"ruleId": f"rule-{n}", "passed": True, "violations": []}
                for n in range(1, 10)
            ],
            "runtime": {
                "callGraph": {
                    "illustrative": False,
                    "synthetic": True,
                    "description": "synthetic smoke",
                    "window": {
                        "start": "2026-01-01T00:00:00.000Z",
                        "end": "2026-01-01T00:30:00.000Z",
                    },
                    "traffic": "this-run",
                    "edges": [
                        {
                            "from": "checkout",
                            "to": "inventory",
                            "protocol": "http",
                            "count": 1,
                        }
                    ],
                    "queried": True,
                },
                "vsImports": {
                    "runtimeOnly": [
                        {
                            "from": "checkout",
                            "to": "inventory",
                            "protocol": "http",
                        }
                    ],
                    "importOnly": [],
                },
                "signals": [
                    {
                        "name": "error-rate",
                        "value": 0.01,
                        "unit": "ratio",
                        "illustrative": True,
                    }
                ],
            },
        }
    )
    boundary = next(
        item
        for item in StubReasoner().reason(payload, _scores(100, []))
        if item.id == "boundary-integrity"
    )
    assert "checkout -> inventory" in boundary.reasoning
    assert "http" in boundary.reasoning
    assert "synthetic smoke" in boundary.reasoning
    assert "this-run" in boundary.reasoning
    assert "error-rate" in boundary.reasoning
    assert "illustrative" in boundary.reasoning


def test_pubsub_runtime_only_edge_is_designed_eventing() -> None:
    payload = AnalysisPayload.model_validate(
        {
            "runId": "r",
            "commitSha": "a" * 40,
            "commitMessage": "ok",
            "timestamp": "2026-01-01T00:00:00.000Z",
            "archTests": [
                {"ruleId": f"rule-{n}", "passed": True, "violations": []}
                for n in range(1, 10)
            ],
            "runtime": {
                "callGraph": {
                    "illustrative": False,
                    "synthetic": True,
                    "description": "synthetic smoke",
                    "window": {
                        "start": "2026-01-01T00:00:00.000Z",
                        "end": "2026-01-01T00:30:00.000Z",
                    },
                    "traffic": "this-run",
                    "edges": [
                        {
                            "from": "checkout",
                            "to": "notification",
                            "protocol": "pubsub",
                            "count": 3,
                        }
                    ],
                    "queried": True,
                },
                "vsImports": {
                    "runtimeOnly": [
                        {
                            "from": "checkout",
                            "to": "notification",
                            "protocol": "pubsub",
                        }
                    ],
                    "importOnly": [],
                },
                "signals": [],
            },
        }
    )
    boundary = next(
        item
        for item in StubReasoner().reason(payload, _scores(100, []))
        if item.id == "boundary-integrity"
    )
    assert "checkout -> notification" in boundary.reasoning
    assert "Designed Pub/Sub" in boundary.reasoning
    assert "hidden" not in boundary.reasoning.lower()


def test_unqueried_runtime_graph_is_not_an_empty_result() -> None:
    payload = AnalysisPayload.model_validate(
        {
            "runId": "r",
            "commitSha": "a" * 40,
            "commitMessage": "ok",
            "timestamp": "2026-01-01T00:00:00.000Z",
            "archTests": [
                {"ruleId": f"rule-{n}", "passed": True, "violations": []}
                for n in range(1, 10)
            ],
            "runtime": {
                "callGraph": {
                    "illustrative": False,
                    "synthetic": True,
                    "description": "synthetic smoke",
                    "window": {
                        "start": "2026-01-01T00:00:00.000Z",
                        "end": "2026-01-01T00:30:00.000Z",
                    },
                    "traffic": "none",
                    "queried": False,
                },
                "vsImports": {"runtimeOnly": [], "importOnly": []},
                "signals": [
                    {
                        "name": "p95-latency",
                        "value": 120,
                        "unit": "ms",
                        "illustrative": True,
                    }
                ],
            },
        }
    )
    boundary = next(
        item
        for item in StubReasoner().reason(payload, _scores(100, []))
        if item.id == "boundary-integrity"
    )
    assert "not queried" in boundary.reasoning
    assert "not an empty graph" in boundary.reasoning
    assert "Runtime-only" not in boundary.reasoning

