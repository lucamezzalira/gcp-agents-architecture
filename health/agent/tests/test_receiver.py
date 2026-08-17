from health_agent.models import ScoreResult
from health_agent.narratives import empty_narratives
from health_agent.receiver import receive_payload


SCORES = ScoreResult.model_validate(
    {
        "overall": 93,
        "characteristics": [
            {"id": "boundary-integrity", "score": 100, "signalsUsed": []},
            {"id": "layering", "score": 100, "signalsUsed": []},
            {"id": "coupling", "score": 100, "signalsUsed": []},
            {"id": "duplication", "score": 100, "signalsUsed": []},
            {"id": "cross-service-integrity", "score": 70, "signalsUsed": ["clone"]},
        ],
        "services": [
            {
                "service": "checkout",
                "overall": 100,
                "characteristics": [
                    {"id": "boundary-integrity", "score": 100, "signalsUsed": []},
                    {"id": "layering", "score": 100, "signalsUsed": []},
                    {"id": "coupling", "score": 100, "signalsUsed": []},
                    {"id": "duplication", "score": 100, "signalsUsed": []},
                ],
            }
        ],
    }
)


class FakeConn:
    def commit(self) -> None:
        return None

    def close(self) -> None:
        return None


def test_receive_payload_ignores_agent_numbers(monkeypatch, capsys) -> None:
    inserted: dict[str, object] = {}
    attached: dict[str, object] = {}
    invoked: dict[str, object] = {}

    monkeypatch.setattr("health_agent.receiver.connect", lambda: FakeConn())
    monkeypatch.setattr("health_agent.receiver.migrate", lambda _conn: None)
    monkeypatch.setattr("health_agent.receiver.load_active_decisions", lambda _conn: [])
    monkeypatch.setattr("health_agent.receiver.load_recent_reads", lambda _conn: [])
    monkeypatch.setattr("health_agent.receiver.score_payload", lambda *_a, **_k: SCORES)

    def fake_insert(_conn, read, _message, _committed=None) -> str:
        inserted["overall"] = read.overall
        inserted["csi"] = next(
            item.score for item in read.characteristics if item.id == "cross-service-integrity"
        )
        inserted["reasoning"] = next(
            item.reasoning
            for item in read.characteristics
            if item.id == "cross-service-integrity"
        )
        return "sha:run"

    def fake_invoke(payload, scores=None, prior_reads=None, persist=False):
        invoked["scores"] = scores
        invoked["persist"] = persist
        narratives = []
        for item in empty_narratives(SCORES):
            narratives.append(
                {
                    "id": item.id,
                    "reasoning": f"prose for {item.id}",
                    "recommendations": ["do not accept 1"],
                }
            )
        return {
            "overall": 1,
            "narratives": narratives,
            "reasoner": "adk",
            "host": "agent-runtime",
            "model": "gemini-2.5-pro",
            "agentIdentity": "principal://agents.example/health-agent",
            "traceId": "abc",
        }

    def fake_attach(_conn, run_id, narratives, **provenance) -> None:
        attached["run_id"] = run_id
        attached["ids"] = [item.id for item in narratives]
        attached["host"] = provenance["host"]
        attached["reasoner"] = provenance["reasoner"]

    monkeypatch.setattr("health_agent.receiver.insert_health_read", fake_insert)
    monkeypatch.setattr("health_agent.receiver.invoke_runtime", fake_invoke)
    monkeypatch.setattr("health_agent.receiver.attach_reasoning", fake_attach)

    run_id = receive_payload(
        {
            "runId": "r1",
            "commitSha": "a" * 40,
            "commitMessage": "test",
            "timestamp": "2026-08-17T00:00:00Z",
            "archTests": [],
            "runtime": {},
            "ruleSetVersion": 8,
        }
    )
    err = capsys.readouterr().err
    assert run_id == "sha:run"
    assert inserted["overall"] == 93
    assert inserted["csi"] == 70
    assert inserted["reasoning"] == ""
    assert invoked["scores"]["overall"] == 93
    assert invoked["persist"] is False
    assert attached["run_id"] == "sha:run"
    assert "cross-service-integrity" in attached["ids"]
    assert attached["host"] == "agent-runtime"
    assert attached["reasoner"] == "adk"
    assert "agent_returned_numeric=" in err


def test_receive_payload_keeps_score_when_runtime_fails(monkeypatch) -> None:
    inserted: dict[str, object] = {}

    monkeypatch.setattr("health_agent.receiver.connect", lambda: FakeConn())
    monkeypatch.setattr("health_agent.receiver.migrate", lambda _conn: None)
    monkeypatch.setattr("health_agent.receiver.load_active_decisions", lambda _conn: [])
    monkeypatch.setattr("health_agent.receiver.load_recent_reads", lambda _conn: [])
    monkeypatch.setattr("health_agent.receiver.score_payload", lambda *_a, **_k: SCORES)

    def fake_insert(_conn, read, _message, _committed=None) -> str:
        inserted["reasoner"] = read.reasoner
        inserted["overall"] = read.overall
        return "sha:run"

    monkeypatch.setattr("health_agent.receiver.insert_health_read", fake_insert)
    monkeypatch.setattr(
        "health_agent.receiver.invoke_runtime",
        lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("engine 502")),
    )
    attached = {"called": False}
    monkeypatch.setattr(
        "health_agent.receiver.attach_reasoning",
        lambda *_a, **_k: attached.__setitem__("called", True),
    )

    try:
        receive_payload(
            {
                "runId": "r1",
                "commitSha": "a" * 40,
                "commitMessage": "test",
                "timestamp": "2026-08-17T00:00:00Z",
                "archTests": [],
                "runtime": {},
                "ruleSetVersion": 8,
            }
        )
    except RuntimeError as exc:
        assert "502" in str(exc)
    else:
        raise AssertionError("expected runtime failure")
    assert inserted["overall"] == 93
    assert inserted["reasoner"] == ""
    assert attached["called"] is False
