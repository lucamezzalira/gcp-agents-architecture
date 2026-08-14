from health_agent.models import AnalysisPayload, HealthRead, RunMetrics, ScoreResult
from health_agent.reasoner_facts import build_facts, metrics_from_payload


def _payload(**overrides: object) -> AnalysisPayload:
    data: dict[str, object] = {
        "runId": "r",
        "commitSha": "current-sha",
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
        "changedFiles": [],
    }
    data.update(overrides)
    return AnalysisPayload.model_validate(data)


def _read(sha: str, modules: int, dependencies: int) -> HealthRead:
    return HealthRead(
        runId=sha,
        commitSha=sha,
        overall=100,
        reasoner="adk",
        metrics=RunMetrics(
            modules=modules,
            dependencies=dependencies,
            duplicationPercentage=4.1,
            orphanCount=0,
            cycleCount=0,
        ),
        characteristics=[
            {
                "id": "layering",
                "score": 100,
                "reasoning": "ok",
                "recommendations": [],
                "signalsUsed": [],
            }
        ],
    )


def test_metrics_from_payload_counts_orphans_and_cycles() -> None:
    payload = _payload(
        dependencyCruiser={
            "cycles": [{"path": ["a.ts", "b.ts"]}],
            "orphans": ["x.ts", "y.ts"],
            "violations": [],
            "metrics": {"modules": 40, "dependencies": 90},
        }
    )
    metrics = metrics_from_payload(payload)
    assert metrics.modules == 40
    assert metrics.dependencies == 90
    assert metrics.orphanCount == 2
    assert metrics.cycleCount == 1


def test_prior_metrics_covers_six_runs_and_skips_current() -> None:
    payload = _payload(commitSha="current-sha")
    scores = ScoreResult.model_validate(
        {
            "overall": 100,
            "characteristics": [
                {"id": "coupling", "score": 100, "signalsUsed": []}
            ],
        }
    )
    priors = [
        _read(f"sha-{index}", modules=30 + index, dependencies=50 + index)
        for index in range(8)
    ]
    priors.append(_read("current-sha", modules=99, dependencies=99))
    facts = build_facts(payload, scores, priors)
    series = facts["priorMetrics"]
    assert isinstance(series, list)
    assert len(series) == 6
    shas = [item["commitSha"] for item in series]
    assert "current-sha" not in shas
    assert shas[0] == "sha-2"
    assert shas[-1] == "sha-7"
    assert series[0]["modules"] == 32
    assert series[-1]["dependencies"] == 57


def test_prior_metrics_stop_before_later_runs() -> None:
    payload = _payload(commitSha="current-sha")
    scores = ScoreResult.model_validate(
        {
            "overall": 100,
            "characteristics": [
                {"id": "coupling", "score": 100, "signalsUsed": []}
            ],
        }
    )
    priors = [
        _read("sha-0", modules=30, dependencies=50),
        _read("sha-1", modules=31, dependencies=51),
        _read("current-sha", modules=82, dependencies=200),
        _read("later-a", modules=90, dependencies=250),
        _read("later-b", modules=99, dependencies=300),
    ]
    facts = build_facts(payload, scores, priors)
    series = facts["priorMetrics"]
    assert isinstance(series, list)
    assert [item["commitSha"] for item in series] == ["sha-0", "sha-1"]
    assert facts["priorOverall"] == [100, 100]


def test_changed_files_are_in_the_facts() -> None:
    payload = _payload(
        changedFiles=[
            "services/notification/src/domain/get-delivery-stats.ts",
            "services/notification/src/transport/metrics-route.ts",
        ]
    )
    scores = ScoreResult.model_validate(
        {
            "overall": 100,
            "characteristics": [
                {"id": "layering", "score": 100, "signalsUsed": []}
            ],
        }
    )
    facts = build_facts(payload, scores, [])
    assert facts["changedFiles"] == [
        "services/notification/src/domain/get-delivery-stats.ts",
        "services/notification/src/transport/metrics-route.ts",
    ]
