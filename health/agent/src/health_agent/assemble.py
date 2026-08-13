from health_agent.models import (
    CharacteristicRead,
    HealthRead,
    Narrative,
    ScoreResult,
)


def assemble(
    run_id: str,
    commit_sha: str,
    scores: ScoreResult,
    narratives: list[Narrative],
    reasoner: str,
    trace_id: str | None = None,
) -> HealthRead:
    by_id = {item.id: item for item in narratives}
    characteristics: list[CharacteristicRead] = []
    for scored in scores.characteristics:
        narrative = by_id.get(scored.id)
        if narrative is None:
            raise RuntimeError(f"missing narrative for {scored.id}")
        if narrative.id != scored.id:
            raise RuntimeError("narrative id does not match score id")
        characteristics.append(
            CharacteristicRead(
                id=scored.id,
                score=scored.score,
                reasoning=narrative.reasoning,
                recommendations=(
                    [] if scored.score == 100 else narrative.recommendations
                ),
                signalsUsed=scored.signalsUsed,
                suppressedBy=scored.suppressedBy,
            )
        )
    return HealthRead(
        runId=run_id,
        commitSha=commit_sha,
        overall=scores.overall,
        characteristics=characteristics,
        reasoner=reasoner,
        traceId=trace_id,
    )


def assert_scores_unchanged(scores: ScoreResult, read: HealthRead) -> None:
    if read.overall != scores.overall:
        raise RuntimeError("agent modified overall score")
    scored = {item.id: item.score for item in scores.characteristics}
    written = {item.id: item.score for item in read.characteristics}
    if scored != written:
        raise RuntimeError("agent modified characteristic scores")
