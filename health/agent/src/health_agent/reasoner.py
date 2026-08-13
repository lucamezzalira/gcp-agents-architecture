from health_agent.models import AnalysisPayload, ArchTestResult, Narrative, ScoreResult


class Reasoner:
    def reason(self, payload: AnalysisPayload, scores: ScoreResult) -> list[Narrative]:
        raise NotImplementedError


def _runtime_note(payload: AnalysisPayload) -> str:
    if payload.runtime.illustrative:
        return " Runtime signals are illustrative and were not scored."
    return ""


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

    def reason(self, payload: AnalysisPayload, scores: ScoreResult) -> list[Narrative]:
        narratives: list[Narrative] = []
        for characteristic in scores.characteristics:
            if characteristic.score == 100:
                narratives.append(
                    Narrative(
                        id=characteristic.id,
                        reasoning=(
                            f"{characteristic.id} is 100. No deterministic findings applied."
                            + _runtime_note(payload)
                        ),
                        recommendations=[],
                    )
                )
                continue
            if characteristic.id == "boundary-integrity":
                narratives.append(
                    _boundary_narrative(
                        payload,
                        characteristic.score,
                        characteristic.signalsUsed,
                    )
                )
                continue
            narratives.append(
                Narrative(
                    id=characteristic.id,
                    reasoning=(
                        f"{characteristic.id} is {characteristic.score} because of "
                        f"{', '.join(characteristic.signalsUsed) or 'tool findings'}."
                        + _runtime_note(payload)
                    ),
                    recommendations=[
                        "Inspect the named signals. Do not extract a shared package "
                        "to silence duplication between these services."
                    ],
                )
            )
        return narratives
