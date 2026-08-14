from health_agent.adk_agent import INSTRUCTION
from health_agent.models import (
    AnalysisPayload,
    HealthRead,
    RunMetrics,
    ScoreResult,
    ServiceCouplingMetric,
)
from health_agent.reasoner_facts import (
    LAYER_PROFILES,
    build_facts,
    enrich_payload_with_priors,
    metric_deltas,
    metrics_from_payload,
)


def _payload(**overrides: object) -> AnalysisPayload:
    data: dict[str, object] = {
        "runId": "r",
        "commitSha": "current-sha",
        "commitMessage": "Add a delivery metrics endpoint to notification.",
        "timestamp": "2026-01-01T00:00:00.000Z",
        "archTests": [
            {"ruleId": f"rule-{n}", "passed": True, "violations": []}
            for n in range(1, 10)
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


def test_facts_include_layer_profiles_and_active_rules() -> None:
    payload = _payload()
    scores = ScoreResult.model_validate(
        {
            "overall": 100,
            "characteristics": [
                {"id": "coupling", "score": 100, "signalsUsed": []}
            ],
        }
    )
    facts = build_facts(payload, scores, [])
    profiles = facts["layerProfiles"]
    assert profiles == LAYER_PROFILES
    assert profiles["transport"]["expected"] == "highly-unstable"
    assert profiles["domain"]["expected"] == "stable"
    assert profiles["infrastructure"]["expected"] == "unstable"
    assert "0.78" in profiles["transport"]["meaning"]
    active = facts["activeRules"]
    assert isinstance(active, list)
    assert "rule-5" in active
    assert "rule-9" in active


def test_metrics_from_payload_stores_service_coupling() -> None:
    payload = _payload(
        dependencyCruiser={
            "cycles": [],
            "orphans": [],
            "violations": [],
            "metrics": {"modules": 40, "dependencies": 90},
            "serviceMetrics": [
                {
                    "service": "checkout",
                    "afferentCoupling": 1,
                    "efferentCoupling": 4,
                },
                {
                    "service": "notification",
                    "afferentCoupling": 6,
                    "efferentCoupling": 2,
                },
            ],
        }
    )
    metrics = metrics_from_payload(payload)
    assert [item.service for item in metrics.serviceCoupling] == [
        "checkout",
        "notification",
    ]
    assert metrics.serviceCoupling[1].afferentCoupling == 6
    assert metrics.serviceCoupling[1].efferentCoupling == 2


def test_enrich_payload_copies_predecessor_coupling() -> None:
    payload = _payload(commitSha="current-sha")
    prior = _read("sha-0", modules=30, dependencies=50)
    assert prior.metrics is not None
    prior.metrics.serviceCoupling = [
        ServiceCouplingMetric(
            service="notification", afferentCoupling=4, efferentCoupling=3
        )
    ]
    enriched = enrich_payload_with_priors(payload, [prior])
    assert len(enriched.priorServiceMetrics) == 1
    assert enriched.priorServiceMetrics[0].service == "notification"
    assert enriched.priorServiceMetrics[0].efferentCoupling == 3
    assert enriched.priorDuplicationCounts is not None


def test_instruction_covers_efferent_level_and_existing_rules() -> None:
    text = INSTRUCTION.lower()
    assert "efferent" in text
    assert "current count" in text
    assert "metricdeltas" in text.replace(" ", "").replace("_", "")
    assert "deterioration paused" in text
    assert "instability" in text
    assert "transport" in text
    assert "0.78" in INSTRUCTION
    assert "highly unstable" in text
    assert "already present" in text
    assert "activeRules" in INSTRUCTION or "activerules" in text
    assert "never recommend reducing" in text
    collapsed = " ".join(text.split())
    assert "mean of the services" in collapsed
    assert "sole platform-level" in text
    assert "synthetic smoke" in text
    assert "runtime-only" in text
    assert "p95-latency" in text
    assert "queried false" in text
    assert "not an empty graph" in text
    assert "http" in text and "pub/sub" in text
    assert "do not collapse" in text
    assert "silence about memory is a correct outcome" in collapsed
    assert "must name the commit and come from a retrieved record" in collapsed
    assert "never state that a commit fixed, introduced or resolved" in collapsed
    assert "acknowledge those prior" not in collapsed
    assert "do not ignore them" not in collapsed


def test_metric_deltas_name_grew_held_cleaned_and_first() -> None:
    payload = _payload(
        commitSha="current-sha",
        duplication={
            "percentage": 2,
            "clones": [
                {
                    "files": [
                        "services/checkout/src/a.ts",
                        "services/notification/src/a.ts",
                    ],
                    "classification": "cross-service",
                    "services": ["checkout", "notification"],
                },
                {
                    "files": [
                        "services/checkout/src/b.ts",
                        "services/checkout/src/c.ts",
                    ],
                    "classification": "internal",
                    "services": ["checkout"],
                },
            ],
        },
        dependencyCruiser={
            "cycles": [],
            "orphans": [],
            "violations": [],
            "metrics": {"modules": 40, "dependencies": 90},
            "serviceMetrics": [
                {
                    "service": "checkout",
                    "afferentCoupling": 1,
                    "efferentCoupling": 2,
                }
            ],
        },
    )
    first = metric_deltas(payload, [])
    assert first["clones"]["crossService"]["direction"] == "first"
    assert first["clones"]["crossService"]["prior"] is None
    assert first["efferentCoupling"][0]["direction"] == "first"

    prior = _read("sha-0", modules=30, dependencies=50)
    assert prior.metrics is not None
    prior.metrics.duplicationCounts.internal = 2
    prior.metrics.duplicationCounts.crossService = 1
    prior.metrics.duplicationCounts.shared = 0
    prior.metrics.serviceCoupling = [
        ServiceCouplingMetric(
            service="checkout", afferentCoupling=1, efferentCoupling=4
        )
    ]
    deltas = metric_deltas(payload, [prior])
    clones = deltas["clones"]
    assert clones["internal"]["direction"] == "cleaned"
    assert clones["internal"]["delta"] == -1
    assert clones["crossService"]["direction"] == "held"
    assert clones["crossService"]["delta"] == 0
    assert deltas["efferentCoupling"][0]["direction"] == "cleaned"
    assert deltas["efferentCoupling"][0]["delta"] == -2

    grown_prior = _read("sha-0", modules=30, dependencies=50)
    assert grown_prior.metrics is not None
    grown_prior.metrics.duplicationCounts.crossService = 0
    grown = metric_deltas(payload, [grown_prior])
    assert grown["clones"]["crossService"]["direction"] == "grew"
    assert grown["clones"]["crossService"]["delta"] == 1

    facts = build_facts(payload, ScoreResult.model_validate(
        {"overall": 90, "characteristics": [{"id": "duplication", "score": 92, "signalsUsed": []}]}
    ), [prior])
    assert "metricDeltas" in facts
    assert facts["metricDeltas"]["clones"]["internal"]["direction"] == "cleaned"


def test_facts_include_runtime_call_graph_and_vs_imports() -> None:
    payload = _payload(
        runtime={
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
                "importOnly": [{"from": "checkout", "to": "notification"}],
            },
            "signals": [
                {
                    "name": "p95-latency",
                    "value": 120,
                    "unit": "ms",
                    "illustrative": True,
                }
            ],
        }
    )
    facts = build_facts(
        payload,
        ScoreResult.model_validate(
            {
                "overall": 100,
                "characteristics": [
                    {"id": "coupling", "score": 100, "signalsUsed": []}
                ],
            }
        ),
        [],
    )
    graph = facts["runtimeCallGraph"]
    assert isinstance(graph, dict)
    assert graph["illustrative"] is False
    assert graph["synthetic"] is True
    assert graph["traffic"] == "this-run"
    assert graph["queried"] is True
    vs_imports = facts["runtimeVsImports"]
    assert isinstance(vs_imports, dict)
    assert vs_imports["runtimeOnly"][0]["from"] == "checkout"
    assert vs_imports["runtimeOnly"][0]["to"] == "inventory"
    assert vs_imports["runtimeOnly"][0]["protocol"] == "http"
    assert facts["runtimeIllustrativeSignals"] == ["p95-latency"]
    assert facts["runtimeIllustrative"] is True


def test_facts_omit_edges_when_trace_was_not_queried() -> None:
    payload = _payload(
        runtime={
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
                    "name": "error-rate",
                    "value": 0.01,
                    "unit": "ratio",
                    "illustrative": True,
                }
            ],
        }
    )
    facts = build_facts(
        payload,
        ScoreResult.model_validate(
            {
                "overall": 100,
                "characteristics": [
                    {"id": "coupling", "score": 100, "signalsUsed": []}
                ],
            }
        ),
        [],
    )
    graph = facts["runtimeCallGraph"]
    assert isinstance(graph, dict)
    assert graph["queried"] is False
    assert "edges" not in graph
    assert facts["runtimeIllustrativeSignals"] == ["error-rate"]


