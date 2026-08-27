from health_agent.drift import drift_narrative
from health_agent.models import (
    AnalysisPayload,
    ArchTestResult,
    HealthRead,
    Narrative,
    ScoreResult,
)
from health_agent.payload_checks import all_rules_passed


class Reasoner:
    def reason(
        self,
        payload: AnalysisPayload,
        scores: ScoreResult,
        prior_reads: list[HealthRead] | None = None,
        memory_snippets: list[str] | None = None,
    ) -> list[Narrative]:
        raise NotImplementedError


def _runtime_note(payload: AnalysisPayload) -> str:
    parts: list[str] = []
    graph = payload.runtime.callGraph
    vs_imports = payload.runtime.vsImports
    if graph is not None and graph.illustrative is False:
        if not graph.queried:
            parts.append(
                " Runtime call graph was not queried; Cloud Trace was not "
                "reached. That is not an empty graph."
            )
        else:
            parts.append(
                " Runtime call graph is observed from synthetic smoke traffic "
                f"({graph.traffic}) and is not scored."
            )
            window = graph.window
            start = window.get("start")
            end = window.get("end")
            if start and end:
                parts.append(f" Trace window {start} to {end}.")
            if vs_imports is not None:
                for edge in vs_imports.runtimeOnly:
                    if edge.protocol == "pubsub":
                        parts.append(
                            f" Designed Pub/Sub {edge.from_service} -> {edge.to} "
                            "(no static import; eventing is the contract)."
                        )
                    else:
                        parts.append(
                            f" Runtime-only {edge.protocol} edge {edge.from_service} -> "
                            f"{edge.to} has no corresponding import."
                        )
                for edge in vs_imports.importOnly:
                    parts.append(
                        f" Import {edge.from_service} -> {edge.to} has no observed "
                        "runtime edge (dead coupling)."
                    )
    leftover = [item.name for item in payload.runtime.signals if item.illustrative]
    if leftover:
        parts.append(
            " " + ", ".join(leftover) + " remain illustrative and were not scored."
        )
    elif payload.runtime.illustrative:
        parts.append(" Runtime signals are illustrative and were not scored.")
    return "".join(parts)


def _failed_rules(payload: AnalysisPayload) -> dict[str, ArchTestResult]:
    return {item.ruleId: item for item in payload.archTests if not item.passed}


def _files(result: ArchTestResult) -> str:
    return ", ".join(item.file for item in result.violations) or "unknown file"


def _boundary_narrative(
    payload: AnalysisPayload,
    score: int,
    signals: list[str],
) -> Narrative:
    failed = _failed_rules(payload)
    parts: list[str] = []
    recommendations: list[str] = []

    if "rule-3" in failed:
        parts.append(
            "Checkout imports the email provider client "
            f"({_files(failed['rule-3'])}). "
            "Confirmations on that path never become a send instruction, "
            "so notification does not see them. Idempotency, retry and delivery "
            "records then cover only the queued mail."
        )
        recommendations.append(
            "Publish a SendInstruction for those confirmations too, and add a "
            "priority field so urgent mail jumps the queue without leaving notification."
        )

    if "rule-4" in failed:
        parts.append(
            "Checkout reads notification delivery records directly "
            f"({_files(failed['rule-4'])}). "
            "Checkout is now coupled to how notification stores deliveries; "
            "a collection rename or schema change there becomes a checkout outage."
        )
        recommendations.append(
            "Have notification expose delivery status over HTTP (or on the "
            "send-instruction ack) and have checkout call that contract instead "
            "of opening notification's Firestore."
        )

    if "rule-5" in failed:
        parts.append(
            "Checkout imports notification internals "
            f"({_files(failed['rule-5'])}), crossing the service boundary."
        )
        recommendations.append(
            "Replace the cross-service import with a published contract "
            "(HTTP or Pub/Sub), not a module in the other service."
        )

    if not parts:
        parts.append(
            "boundary-integrity is "
            f"{score} because of {', '.join(signals) or 'tool findings'}."
        )
        recommendations.append(
            "Inspect the named signals and restore the service boundary they describe."
        )
    else:
        parts.append(f"boundary-integrity is {score}.")

    return Narrative(
        id="boundary-integrity",
        reasoning=" ".join(parts) + _runtime_note(payload),
        recommendations=recommendations,
    )


class StubReasoner(Reasoner):
    """Deterministic stand-in so local tests need no model credentials."""

    def reason(
        self,
        payload: AnalysisPayload,
        scores: ScoreResult,
        prior_reads: list[HealthRead] | None = None,
        memory_snippets: list[str] | None = None,
    ) -> list[Narrative]:
        priors = prior_reads or []
        narratives: list[Narrative] = []
        rules_hold = all_rules_passed(payload)

        def emit(char_id: str, score: int, signals: list[str]) -> Narrative:
            is_boundary = char_id == "boundary-integrity" or char_id.endswith(
                ":boundary-integrity"
            )
            is_csi = char_id == "cross-service-integrity"
            if (is_boundary or is_csi) and not rules_hold:
                item = _boundary_narrative(payload, score, signals)
                return item.model_copy(update={"id": char_id})
            if score == 100 or rules_hold:
                item = drift_narrative(
                    char_id,
                    score,
                    payload,
                    priors,
                    _runtime_note(payload),
                )
                return item.model_copy(update={"id": char_id})
            return Narrative(
                id=char_id,
                reasoning=(
                    f"{char_id} is {score} because of "
                    f"{', '.join(signals) or 'tool findings'}."
                    + _runtime_note(payload)
                ),
                recommendations=[
                    "Inspect the named signals. Do not extract a shared package "
                    "to silence duplication between these services."
                ],
            )

        for characteristic in scores.characteristics:
            narratives.append(
                emit(
                    characteristic.id,
                    characteristic.score,
                    characteristic.signalsUsed,
                )
            )
        for service in scores.services:
            for characteristic in service.characteristics:
                narratives.append(
                    emit(
                        f"{service.service}:{characteristic.id}",
                        characteristic.score,
                        characteristic.signalsUsed,
                    )
                )
        if memory_snippets:
            note = " Prior memory: " + " | ".join(memory_snippets)
            narratives = [
                item.model_copy(update={"reasoning": item.reasoning + note})
                if item.id == "layering"
                else item
                for item in narratives
            ]
        return narratives
