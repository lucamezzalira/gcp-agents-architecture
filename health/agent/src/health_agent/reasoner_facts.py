from __future__ import annotations

from collections import Counter

from health_agent.models import (
    AnalysisPayload,
    DuplicationCounts,
    HealthRead,
    RunMetrics,
    ScoreResult,
)


def metrics_from_payload(payload: AnalysisPayload) -> RunMetrics:
    counts = Counter(
        clone.classification or "internal" for clone in payload.duplication.clones
    )
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
        ),
    )


def predecessors(prior_reads: list[HealthRead], current_sha: str) -> list[HealthRead]:
    found: list[HealthRead] = []
    for read in prior_reads:
        if read.commitSha == current_sha:
            break
        found.append(read)
    return found


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
            }
        )
    return series[-limit:]


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
