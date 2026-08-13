from __future__ import annotations

from typing import Protocol


class MemoryBank(Protocol):
    def retrieve(self, query: str) -> list[str]: ...

    def write(
        self,
        observation: str,
        metadata: dict[str, str] | None = None,
    ) -> None: ...


class NoopMemoryBank:
    def retrieve(self, query: str) -> list[str]:
        return []

    def write(
        self,
        observation: str,
        metadata: dict[str, str] | None = None,
    ) -> None:
        return None


class RecordingMemoryBank:
    """In-process bank for tests. Not Vertex Memory Bank."""

    def __init__(self) -> None:
        self.entries: list[str] = []
        self.retrieve_calls: list[int] = []
        self.write_calls: list[int] = []
        self._clock = 0

    def retrieve(self, query: str) -> list[str]:
        self._clock += 1
        self.retrieve_calls.append(self._clock)
        return list(self.entries)

    def write(
        self,
        observation: str,
        metadata: dict[str, str] | None = None,
    ) -> None:
        self._clock += 1
        self.write_calls.append(self._clock)
        self.entries.append(observation)


def observation_from_read(commit_sha: str, overall: int, layering: str) -> str:
    return (
        f"commit {commit_sha[:7]} scored {overall}. "
        f"layering note: {layering[:180]}"
    )
