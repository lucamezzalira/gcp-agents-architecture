from health_agent.models import AnalysisPayload, Narrative, ScoreResult


class Reasoner:
    def reason(self, payload: AnalysisPayload, scores: ScoreResult) -> list[Narrative]:
        raise NotImplementedError


class StubReasoner(Reasoner):
    """Deterministic stand-in so local tests need no model credentials."""

    def reason(self, payload: AnalysisPayload, scores: ScoreResult) -> list[Narrative]:
        runtime_note = ""
        if payload.runtime.illustrative:
            runtime_note = " Runtime signals are illustrative and were not scored."
        narratives: list[Narrative] = []
        for characteristic in scores.characteristics:
            if characteristic.score == 100:
                narratives.append(
                    Narrative(
                        id=characteristic.id,
                        reasoning=(
                            f"{characteristic.id} is 100. No deterministic findings applied."
                            + runtime_note
                        ),
                        recommendations=[],
                    )
                )
                continue
            failed = [item.ruleId for item in payload.archTests if not item.passed]
            recommendations = [
                "Keep provider access inside services/notification.",
                "Publish a SendInstruction instead of calling the email provider.",
            ]
            if "rule-3" not in failed:
                recommendations = [
                    f"Inspect signals {characteristic.signalsUsed} and remove the findings."
                ]
            narratives.append(
                Narrative(
                    id=characteristic.id,
                    reasoning=(
                        f"{characteristic.id} is {characteristic.score} because of "
                        f"{', '.join(characteristic.signalsUsed) or 'tool findings'}."
                        + runtime_note
                    ),
                    recommendations=recommendations,
                )
            )
        return narratives
