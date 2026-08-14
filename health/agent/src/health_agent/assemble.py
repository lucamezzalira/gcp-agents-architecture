from health_agent.models import (
    CharacteristicRead,
    HealthRead,
    Narrative,
    ScoreResult,
    ServiceRead,
)


def _characteristic(
    scored_id: str,
    display_id: str,
    score: int,
    signals: list[str],
    suppressed: list[str] | None,
    by_id: dict[str, Narrative],
) -> CharacteristicRead:
    narrative = by_id.get(scored_id)
    if narrative is None:
        raise RuntimeError(f"missing narrative for {scored_id}")
    return CharacteristicRead(
        id=display_id,
        score=score,
        reasoning=narrative.reasoning,
        recommendations=[] if score == 100 else narrative.recommendations,
        signalsUsed=signals,
        suppressedBy=suppressed,
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
    characteristics = [
        _characteristic(
            scored.id,
            scored.id,
            scored.score,
            scored.signalsUsed,
            scored.suppressedBy,
            by_id,
        )
        for scored in scores.characteristics
    ]
    services = [
        ServiceRead(
            service=service.service,
            overall=service.overall,
            characteristics=[
                _characteristic(
                    f"{service.service}:{item.id}",
                    item.id,
                    item.score,
                    item.signalsUsed,
                    item.suppressedBy,
                    by_id,
                )
                for item in service.characteristics
            ],
        )
        for service in scores.services
    ]
    return HealthRead(
        runId=run_id,
        commitSha=commit_sha,
        overall=scores.overall,
        characteristics=characteristics,
        reasoner=reasoner,
        traceId=trace_id,
        services=services,
    )


def assert_scores_unchanged(scores: ScoreResult, read: HealthRead) -> None:
    if read.overall != scores.overall:
        raise RuntimeError("agent modified overall score")
    scored = {item.id: item.score for item in scores.characteristics}
    written = {item.id: item.score for item in read.characteristics}
    if scored != written:
        raise RuntimeError("agent modified characteristic scores")
    scored_services = {
        item.service: {char.id: char.score for char in item.characteristics}
        for item in scores.services
    }
    written_services = {
        item.service: {char.id: char.score for char in item.characteristics}
        for item in read.services
    }
    if scored_services != written_services:
        raise RuntimeError("agent modified service scores")
