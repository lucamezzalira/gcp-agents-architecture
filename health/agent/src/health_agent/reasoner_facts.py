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
        "priorOverall": [
            item.overall for item in predecessors(priors, payload.commitSha)
        ][-6:],
        "memoryBank": memory_snippets or [],
        "runtimeIllustrative": payload.runtime.illustrative,
        "narrativeIds": [item.id for item in scores.characteristics]
        + [
            f"{service.service}:{item.id}"
            for service in scores.services
            for item in service.characteristics
        ],
    }
