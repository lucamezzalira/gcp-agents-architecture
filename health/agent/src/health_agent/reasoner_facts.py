from __future__ import annotations

from collections import Counter

from health_agent.models import (
    AnalysisPayload,
    DuplicationCounts,
    HealthRead,
    RunMetrics,
    ScoreResult,
)

KNOWN_RULE_IDS = [f"rule-{n}" for n in range(1, 10)]


def leftover_runtime_illustrative(payload: AnalysisPayload) -> bool:
    if any(item.illustrative for item in payload.runtime.signals):
        return True
    if payload.runtime.illustrative:
        return True
    return False


LAYER_PROFILES = {
    "transport": {
        "expected": "highly-unstable",
        "meaning": (
            "Depends on domain; nothing should depend on it. "
            "Low I means something depends on transport. "
            "A transport folder at 0.78 is healthy. Never recommend reducing it."
        ),
    },
    "domain": {
        "expected": "stable",
        "meaning": (
            "Things depend on it; it depends on little. Rising I is drift."
        ),
    },
    "infrastructure": {
        "expected": "unstable",
        "meaning": (
            "Implements ports; depended upon only through them."
        ),
    },
}


def metrics_from_payload(payload: AnalysisPayload) -> RunMetrics:
    counts = Counter(
        clone.classification or "internal" for clone in payload.duplication.clones
    )
    internal_by_service: dict[str, int] = {}
    for clone in payload.duplication.clones:
        classification = clone.classification or "internal"
        if classification != "internal":
            continue
        service = clone.services[0] if clone.services else None
        if service is None:
            continue
        internal_by_service[service] = internal_by_service.get(service, 0) + 1
    layers: dict[str, list[float]] = {}
    for metric in payload.dependencyCruiser.folderMetrics:
        folder = metric.folder.replace("\\", "/")
        for layer in ("domain", "infrastructure", "transport"):
            if folder.endswith(f"/src/{layer}") and folder.startswith("services/"):
                service = folder.split("/")[1]
                layers.setdefault(service, []).append(metric.instability)
    instability = {
        service: sum(values) / len(values)
        for service, values in layers.items()
        if values
    }
    return RunMetrics(
        modules=payload.dependencyCruiser.metrics.modules,
        dependencies=payload.dependencyCruiser.metrics.dependencies,
        duplicationPercentage=payload.duplication.percentage,
        orphanCount=len(payload.dependencyCruiser.orphans),
        cycleCount=len(payload.dependencyCruiser.cycles),
        folderInstability=instability,
        duplicationCounts=DuplicationCounts(
            internal=counts.get("internal", 0),
            crossService=counts.get("cross-service", 0),
            shared=counts.get("shared", 0),
            internalByService=internal_by_service,
        ),
        serviceCoupling=list(payload.dependencyCruiser.serviceMetrics),
    )


def predecessors(prior_reads: list[HealthRead], current_sha: str) -> list[HealthRead]:
    found: list[HealthRead] = []
    for read in prior_reads:
        if read.commitSha == current_sha:
            break
        found.append(read)
    return found


def last_predecessor_metrics(
    prior_reads: list[HealthRead], current_sha: str
) -> RunMetrics | None:
    for read in reversed(predecessors(prior_reads, current_sha)):
        if read.metrics is not None:
            return read.metrics
    return None


def _direction(current: int, prior: int | None) -> str:
    if prior is None:
        return "first"
    if current > prior:
        return "grew"
    if current < prior:
        return "cleaned"
    return "held"


def _delta_side(current: int, prior: int | None) -> dict[str, object]:
    return {
        "current": current,
        "prior": prior,
        "delta": None if prior is None else current - prior,
        "direction": _direction(current, prior),
    }


def metric_deltas(
    payload: AnalysisPayload,
    prior_reads: list[HealthRead] | None = None,
) -> dict[str, object]:
    current = metrics_from_payload(payload)
    prior = last_predecessor_metrics(prior_reads or [], payload.commitSha)
    if prior is None and payload.priorDuplicationCounts is not None:
        prior_dup = payload.priorDuplicationCounts
        prior_ce = {item.service: item for item in payload.priorServiceMetrics}
    elif prior is None:
        prior_dup = None
        prior_ce = {}
    else:
        prior_dup = prior.duplicationCounts
        prior_ce = {item.service: item for item in prior.serviceCoupling}
    clones = {
        "internal": _delta_side(
            current.duplicationCounts.internal,
            None if prior_dup is None else prior_dup.internal,
        ),
        "crossService": _delta_side(
            current.duplicationCounts.crossService,
            None if prior_dup is None else prior_dup.crossService,
        ),
        "shared": _delta_side(
            current.duplicationCounts.shared,
            None if prior_dup is None else prior_dup.shared,
        ),
    }
    seen: set[str] = set()
    efferent: list[dict[str, object]] = []
    for item in current.serviceCoupling:
        seen.add(item.service)
        previous = prior_ce.get(item.service)
        prior_val = None if previous is None else int(previous.efferentCoupling)
        current_val = int(item.efferentCoupling)
        side = _delta_side(current_val, prior_val)
        side["service"] = item.service
        efferent.append(side)
    for service, previous in prior_ce.items():
        if service in seen:
            continue
        side = _delta_side(0, int(previous.efferentCoupling))
        side["service"] = service
        efferent.append(side)
    return {"clones": clones, "efferentCoupling": efferent}


def enrich_payload_with_priors(
    payload: AnalysisPayload,
    prior_reads: list[HealthRead],
) -> AnalysisPayload:
    metrics = last_predecessor_metrics(prior_reads, payload.commitSha)
    if metrics is None:
        return payload
    updates: dict[str, object] = {
        "priorDuplicationCounts": metrics.duplicationCounts,
    }
    if metrics.serviceCoupling:
        updates["priorServiceMetrics"] = metrics.serviceCoupling
    return payload.model_copy(update=updates)


def prior_metrics_series(
    prior_reads: list[HealthRead],
    current_sha: str,
    limit: int = 6,
) -> list[dict[str, object]]:
    series: list[dict[str, object]] = []
    for read in predecessors(prior_reads, current_sha):
        if read.metrics is None:
            continue
        series.append(
            {
                "commitSha": read.commitSha,
                "modules": read.metrics.modules,
                "dependencies": read.metrics.dependencies,
                "folderInstability": read.metrics.folderInstability,
                "duplicationCounts": read.metrics.duplicationCounts.model_dump(),
                "orphanCount": read.metrics.orphanCount,
                "cycleCount": read.metrics.cycleCount,
                "serviceCoupling": [
                    item.model_dump() for item in read.metrics.serviceCoupling
                ],
            }
        )
    return series[-limit:]


def active_rule_ids(payload: AnalysisPayload) -> list[str]:
    found = [item.ruleId for item in payload.archTests]
    return found if found else list(KNOWN_RULE_IDS)


def build_facts(
    payload: AnalysisPayload,
    scores: ScoreResult,
    prior_reads: list[HealthRead] | None = None,
    memory_snippets: list[str] | None = None,
) -> dict[str, object]:
    priors = prior_reads or []
    return {
        "overall": scores.overall,
        "characteristics": [
            {
                "id": item.id,
                "score": item.score,
                "signalsUsed": item.signalsUsed,
                "suppressedBy": item.suppressedBy,
            }
            for item in scores.characteristics
        ],
        "services": [
            {
                "service": service.service,
                "overall": service.overall,
                "characteristics": [
                    {
                        "id": f"{service.service}:{item.id}",
                        "score": item.score,
                        "signalsUsed": item.signalsUsed,
                        "suppressedBy": item.suppressedBy,
                    }
                    for item in service.characteristics
                ],
            }
            for service in scores.services
        ],
        "failedRules": [
            {
                "ruleId": item.ruleId,
                "files": [violation.file for violation in item.violations],
                "details": [violation.detail for violation in item.violations],
            }
            for item in payload.archTests
            if not item.passed
        ],
        "activeRules": active_rule_ids(payload),
        "layerProfiles": LAYER_PROFILES,
        "commitMessage": payload.commitMessage,
        "ruleSetVersion": payload.ruleSetVersion,
        "changedFiles": list(payload.changedFiles),
        "recentCommits": [item.message for item in payload.recentCommits],
        "duplication": {
            "percentage": payload.duplication.percentage,
            "clones": [
                {
                    "files": item.files,
                    "classification": item.classification,
                    "services": item.services,
                }
                for item in payload.duplication.clones
            ],
        },
        "couplingMetrics": {
            "modules": payload.dependencyCruiser.metrics.modules,
            "dependencies": payload.dependencyCruiser.metrics.dependencies,
            "folderMetrics": [
                item.model_dump() for item in payload.dependencyCruiser.folderMetrics
            ],
            "serviceMetrics": [
                item.model_dump() for item in payload.dependencyCruiser.serviceMetrics
            ],
        },
        "priorMetrics": prior_metrics_series(priors, payload.commitSha),
        "metricDeltas": metric_deltas(payload, priors),
        "priorOverall": [
            item.overall for item in predecessors(priors, payload.commitSha)
        ][-6:],
        "memoryBank": memory_snippets or [],
        "runtimeCallGraph": (
            payload.runtime.callGraph.model_dump(by_alias=True, exclude_none=True)
            if payload.runtime.callGraph is not None
            else None
        ),
        "runtimeVsImports": (
            payload.runtime.vsImports.model_dump(by_alias=True)
            if payload.runtime.vsImports is not None
            else None
        ),
        "runtimeIllustrativeSignals": [
            item.name for item in payload.runtime.signals if item.illustrative
        ],
        "runtimeIllustrative": leftover_runtime_illustrative(payload),
        "narrativeIds": [item.id for item in scores.characteristics]
        + [
            f"{service.service}:{item.id}"
            for service in scores.services
            for item in service.characteristics
        ],
    }
