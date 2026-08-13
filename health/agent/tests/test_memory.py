from pathlib import Path

from health_agent.memory import RecordingMemoryBank
from health_agent.reasoner import StubReasoner
from health_agent.run import produce_health_read
from health_agent.score_bridge import repo_root


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
    layering_first = next(item for item in first.characteristics if item.id == "layering")
    layering_second = next(
        item for item in second.characteristics if item.id == "layering"
    )
    assert layering_first.reasoning != layering_second.reasoning
    assert "Prior memory:" in layering_second.reasoning
    assert Path(payload_path).exists()
