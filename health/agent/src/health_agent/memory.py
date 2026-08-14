from __future__ import annotations

from typing import Protocol

from health_agent.models import AnalysisPayload, HealthRead, ScoreResult

RECORD_MARKER = "RECORD sha="


class MemoryBank(Protocol):
    def retrieve(self, query: str) -> list[str]: ...

    def write(
        self,
        observation: str,
        metadata: dict[str, str] | None = None,
    ) -> None: ...

    def purge(self) -> int: ...


class NoopMemoryBank:
    def retrieve(self, query: str) -> list[str]:
        return []

    def write(
        self,
        observation: str,
        metadata: dict[str, str] | None = None,
    ) -> None:
        return None

    def purge(self) -> int:
        return 0


class RecordingMemoryBank:
    """In-process bank for tests. Not Vertex Memory Bank."""

    def __init__(self) -> None:
        self.entries: list[str] = []
        self.queries: list[str] = []
        self.retrieve_calls: list[int] = []
        self.write_calls: list[int] = []
        self._clock = 0

    def retrieve(self, query: str) -> list[str]:
        self._clock += 1
        self.retrieve_calls.append(self._clock)
        self.queries.append(query)
        return list(self.entries)

    def write(
        self,
        observation: str,
        metadata: dict[str, str] | None = None,
    ) -> None:
        self._clock += 1
        self.write_calls.append(self._clock)
        self.entries.append(observation)

    def purge(self) -> int:
        count = len(self.entries)
        self.entries.clear()
        return count


def memory_retrieve_query(payload: AnalysisPayload) -> str:
    names = list(payload.services)
    if not names:
        seen: set[str] = set()
        for path in payload.changedFiles:
            parts = path.replace("\\", "/").split("/")
            if len(parts) >= 2 and parts[0] == "services":
                seen.add(parts[1])
        names = sorted(seen)
    paths = " ".join(f"services/{name}" for name in names)
    message = payload.commitMessage.strip()
    if not paths:
        scoped = message
    elif message.endswith("."):
        scoped = f"{message} paths: {paths}"
    else:
        scoped = f"{message}. paths: {paths}"
    return f"{scoped} RECORD sha="


def is_structured_record(text: str) -> bool:
    return RECORD_MARKER in text


def keep_structured_records(snippets: list[str]) -> list[str]:
    return [item for item in snippets if is_structured_record(item)]


def _findings_from_scores(scores: ScoreResult) -> set[str]:
    found: set[str] = set()
    for item in scores.characteristics:
        found.update(item.signalsUsed)
    for service in scores.services:
        for item in service.characteristics:
            found.update(item.signalsUsed)
    return found


def _findings_from_read(read: HealthRead) -> set[str]:
    found: set[str] = set()
    for item in read.characteristics:
        found.update(item.signalsUsed)
    for service in read.services:
        for item in service.characteristics:
            found.update(item.signalsUsed)
    return found


def _score_lines(scores: ScoreResult) -> list[str]:
    lines: list[str] = []
    for item in scores.characteristics:
        extra = ""
        if item.signalsUsed:
            extra = " findings=" + ",".join(item.signalsUsed)
        lines.append(f"platform:{item.id} score={item.score}{extra}")
    for service in scores.services:
        lines.append(f"service:{service.service} overall={service.overall}")
        for item in service.characteristics:
            extra = ""
            if item.signalsUsed:
                extra = " findings=" + ",".join(item.signalsUsed)
            lines.append(
                f"service:{service.service}:{item.id} score={item.score}{extra}"
            )
    return lines


def observation_from_scores(
    commit_sha: str,
    scores: ScoreResult,
    previous: HealthRead | ScoreResult | None = None,
) -> str:
    current = _findings_from_scores(scores)
    if previous is None:
        prior: set[str] = set()
    elif isinstance(previous, ScoreResult):
        prior = _findings_from_scores(previous)
    else:
        prior = _findings_from_read(previous)
    fired = sorted(current - prior) if prior else sorted(current)
    cleared = sorted(prior - current)
    lines = [
        f"{RECORD_MARKER}{commit_sha[:7]} overall={scores.overall}",
        *_score_lines(scores),
        "fired=" + (",".join(fired) if fired else "none"),
        "cleared=" + (",".join(cleared) if cleared else "none"),
    ]
    return "\n".join(lines)
