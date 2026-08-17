from pathlib import Path

from health_agent.assemble import assert_scores_unchanged
from health_agent.memory import (
    NoopMemoryBank,
    RecordingMemoryBank,
    keep_structured_records,
    memory_retrieve_query,
    observation_from_scores,
)
from health_agent.models import AnalysisPayload, CharacteristicRead, HealthRead, ScoreResult
from health_agent.reasoner import StubReasoner
from health_agent.run import produce_health_read
from health_agent.score_bridge import repo_root, score_payload


class FailingWriteMemoryBank:
    def retrieve(self, query: str) -> list[str]:
        return []

    def write(
        self,
        observation: str,
        metadata: dict[str, str] | None = None,
    ) -> None:
        raise AttributeError("'AsyncClient' object has no attribute 'async_request'")

    def purge(self) -> int:
        return 0


def test_memory_retrieve_happens_before_write_and_changes_reasoning() -> None:
    payload_path = (
        repo_root() / "health" / "scoring" / "fixtures" / "zero-findings.json"
    )
    bank = RecordingMemoryBank()
    first = produce_health_read(
        payload_path,
        reasoner=StubReasoner(),
        memory=bank,
    )
    second = produce_health_read(
        payload_path,
        reasoner=StubReasoner(),
        memory=bank,
    )
    assert bank.retrieve_calls, "retrieval must run before reasoning"
    assert bank.write_calls, "a write must happen after reasoning"
    assert bank.retrieve_calls[0] < bank.write_calls[0]
    assert bank.entries
    assert "RECORD sha=" in bank.entries[0]
    layering_first = next(item for item in first.characteristics if item.id == "layering")
    layering_second = next(
        item for item in second.characteristics if item.id == "layering"
    )
    assert layering_first.reasoning != layering_second.reasoning
    assert "Prior memory:" in layering_second.reasoning
    assert Path(payload_path).exists()


def test_empty_retrieve_does_not_mention_memory() -> None:
    payload_path = (
        repo_root() / "health" / "scoring" / "fixtures" / "zero-findings.json"
    )
    read = produce_health_read(
        payload_path,
        reasoner=StubReasoner(),
        memory=NoopMemoryBank(),
    )
    for item in read.characteristics:
        assert "memory" not in item.reasoning.lower()
        assert "memory bank" not in item.reasoning.lower()


def test_retrieve_query_includes_every_payload_service() -> None:
    payload = AnalysisPayload.model_validate(
        {
            "runId": "r",
            "commitSha": "a" * 40,
            "commitMessage": "Ask inventory for stock over HTTP.",
            "timestamp": "2026-01-01T00:00:00.000Z",
            "services": ["checkout", "inventory", "notification"],
            "archTests": [],
            "runtime": {"illustrative": True, "signals": []},
        }
    )
    query = memory_retrieve_query(payload)
    assert "services/checkout" in query
    assert "services/inventory" in query
    assert "services/notification" in query
    assert query.startswith("Ask inventory for stock over HTTP.")
    assert "RECORD sha=" in query


def test_observation_is_structured_scores_and_contains_no_prose() -> None:
    long_note = "a previous layering violation in checkout was resolved"
    previous = HealthRead(
        runId="prev",
        commitSha="1111111111111111",
        overall=80,
        reasoner="stub",
        characteristics=[
            CharacteristicRead(
                id="cross-service-integrity",
                score=80,
                reasoning=long_note,
                recommendations=[],
                signalsUsed=["jscpd:cross-service:old|pair"],
            )
        ],
    )
    scores = ScoreResult.model_validate(
        {
            "overall": 90,
            "characteristics": [
                {
                    "id": "layering",
                    "score": 100,
                    "signalsUsed": [],
                },
                {
                    "id": "cross-service-integrity",
                    "score": 60,
                    "signalsUsed": ["jscpd:cross-service:a|b"],
                },
            ],
            "services": [
                {
                    "service": "checkout",
                    "overall": 100,
                    "characteristics": [
                        {"id": "layering", "score": 100, "signalsUsed": []},
                    ],
                }
            ],
        }
    )
    text = observation_from_scores("abcdef1234567890", scores, previous)
    assert text.startswith("RECORD sha=abcdef1")
    assert "overall=90" in text
    assert "platform:cross-service-integrity score=60" in text
    assert "jscpd:cross-service:a|b" in text
    assert "fired=jscpd:cross-service:a|b" in text
    assert "cleared=jscpd:cross-service:old|pair" in text
    assert long_note not in text
    assert "resolved" not in text
    assert "violation" not in text


def test_keep_structured_records_drops_free_prose() -> None:
    kept = keep_structured_records(
        [
            "Memory Bank shows checkout layering was resolved.",
            "RECORD sha=72673d2 overall=100\nplatform:layering score=100\nfired=none\ncleared=none",
        ]
    )
    assert len(kept) == 1
    assert "RECORD sha=72673d2" in kept[0]


def test_produce_health_read_queries_inventory_when_listed() -> None:
    payload_path = (
        repo_root() / "health" / "scoring" / "fixtures" / "zero-findings.json"
    )
    payload = AnalysisPayload.model_validate_json(payload_path.read_text())
    payload = payload.model_copy(
        update={"services": ["checkout", "inventory", "notification"]}
    )
    bank = RecordingMemoryBank()
    from tempfile import NamedTemporaryFile

    with NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
        handle.write(payload.model_dump_json(by_alias=True, exclude_none=True))
        temp = Path(handle.name)
    try:
        produce_health_read(temp, reasoner=StubReasoner(), memory=bank)
    finally:
        temp.unlink(missing_ok=True)
    assert bank.queries
    assert "services/inventory" in bank.queries[0]
    assert "RECORD sha=" in bank.queries[0]
    assert "RECORD sha=" in bank.entries[0]
    assert "resolved" not in bank.entries[0]


def test_memory_create_request_stores_fact_not_session_events() -> None:
    from health_agent.vertex_memory import memory_create_request

    observation = (
        "RECORD sha=72673d2 overall=100\n"
        "platform:layering score=100\n"
        "fired=none\n"
        "cleared=none"
    )
    body = memory_create_request(observation, "architecture_health", "health-agent")
    assert body["fact"] == observation
    scope = body["scope"]
    assert isinstance(scope, dict)
    assert scope["app_name"] == "architecture_health"
    assert scope["user_id"] == "health-agent"
    assert "direct_contents_source" not in body
    assert "events" not in body


def test_recording_memory_bank_purge_forgets_entries() -> None:
    bank = RecordingMemoryBank()
    bank.write("RECORD sha=edfd7d7 overall=73")
    bank.write("a previous layering violation was resolved")
    assert bank.retrieve("layering") == [
        "RECORD sha=edfd7d7 overall=73",
        "a previous layering violation was resolved",
    ]
    removed = bank.purge()
    assert removed == 2
    assert bank.retrieve("layering") == []
    assert bank.purge() == 0


def test_memory_write_failure_still_returns_health_read() -> None:
    payload_path = (
        repo_root() / "health" / "scoring" / "fixtures" / "zero-findings.json"
    )
    scores = score_payload(payload_path)
    read = produce_health_read(
        payload_path,
        reasoner=StubReasoner(),
        memory=FailingWriteMemoryBank(),
    )
    assert_scores_unchanged(scores, read)
    assert read.commitSha
    assert read.overall == scores.overall
    assert read.characteristics
