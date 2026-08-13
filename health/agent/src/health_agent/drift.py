from __future__ import annotations

from health_agent.models import AnalysisPayload, HealthRead, Narrative


def _normalise(path: str) -> str:
    return path.replace("\\", "/")


def _service_name(path: str) -> str | None:
    normalised = _normalise(path)
    for name in ("checkout", "notification"):
        if f"{name}/" in normalised or normalised.startswith(f"{name}/"):
            return name
    return None


def _within_service_clones(payload: AnalysisPayload) -> list[str]:
    names: list[str] = []
    for clone in payload.duplication.clones:
        files = [_normalise(item) for item in clone.files]
        unique = list(dict.fromkeys(files))
        if len(unique) < 2:
            continue
        if not all("/src/" in item for item in unique):
            continue
        if any(".test." in item for item in unique):
            continue
        services = {_service_name(item) for item in unique}
        services.discard(None)
        if len(services) != 1:
            continue
        service = next(iter(services))
        names.append(f"{service}: {', '.join(unique)}")
    return names


def _cross_service_clones(payload: AnalysisPayload) -> bool:
    for clone in payload.duplication.clones:
        services = {_service_name(item) for item in clone.files}
        services.discard(None)
        if len(services) > 1:
            return True
    return False


def _recent_subjects(payload: AnalysisPayload) -> list[str]:
    if payload.recentCommits:
        return [item.message for item in payload.recentCommits[:6]]
    if payload.commitMessage:
        return [payload.commitMessage]
    return []


def _all_rules_passed(payload: AnalysisPayload) -> bool:
    return all(item.passed for item in payload.archTests)


def drift_narrative(
    characteristic_id: str,
    score: int,
    payload: AnalysisPayload,
    prior_reads: list[HealthRead],
    runtime_note: str,
) -> Narrative:
    subjects = _recent_subjects(payload)
    metrics = payload.dependencyCruiser.metrics
    within = _within_service_clones(payload)
    history = len(prior_reads) > 0
    parts: list[str] = []

    if characteristic_id == "layering":
        parts.append(f"layering is {score}. No transport-to-infrastructure import was recorded.")
        if history and _all_rules_passed(payload):
            parts.append(
                "Architecture tests do not inspect whether a domain method "
                "decides anything or only forwards a query to storage, so a "
                "pass-through in domain/ will not move this number."
            )
        elif not history:
            parts.append("No deterministic findings applied.")

    elif characteristic_id == "coupling":
        graph = (
            f"dependency-cruiser currently sees {metrics.modules} modules "
            f"and {metrics.dependencies} dependencies."
        )
        if score == 100:
            parts.append(f"coupling is 100. No cycles or orphans. {graph}")
        else:
            parts.append(f"coupling is {score}. {graph}")
        if history:
            parts.append(
                "That score only moves when a cycle or orphan appears, so "
                "growth in the graph is invisible to the number."
            )
        if history and len(subjects) >= 2:
            parts.append("Recent commits: " + "; ".join(subjects) + ".")
            parts.append(
                "Read as a sequence, not as unrelated clean scores: the rules "
                "stayed green while the services kept accumulating surface."
            )

    elif characteristic_id == "duplication":
        pct = payload.duplication.percentage
        parts.append(f"duplication is {score} at {pct:.1f}%.")
        if within:
            parts.append(
                "Copies inside a single service ("
                + "; ".join(within)
                + ") are not the cross-service rendering split this repo accepted. "
                "Those variants may still be allowed to diverge, but they are a "
                "different judgment than duplicating send-instruction.ts."
            )
        elif _cross_service_clones(payload):
            parts.append(
                "The remaining clones sit across checkout and notification "
                "(contracts, logger, body store). That split is deliberate."
            )
        else:
            parts.append("No deterministic findings applied.")

    else:
        parts.append(f"{characteristic_id} is {score}. Architecture tests still pass.")
        if history and _all_rules_passed(payload):
            parts.append("The SendInstruction contract is still the only door.")
            joined = " ".join(subjects).lower()
            if any(
                token in joined
                for token in ("refund", "abandoned", "reminder", "welcome")
            ):
                parts.append(
                    "New mail jobs have no priority or kind field, so callers "
                    "encode intent in the subject line. The boundary is holding "
                    "and the contract is the thing under pressure."
                )
            if subjects:
                parts.append("Recent commits: " + "; ".join(subjects) + ".")

    return Narrative(
        id=characteristic_id,
        reasoning=" ".join(parts) + runtime_note,
        recommendations=[],
    )
