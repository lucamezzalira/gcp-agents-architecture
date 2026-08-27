from health_agent.models import ScoreResult
from health_agent.narratives import empty_narratives
from health_agent.persist import InsertResult
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

    def fake_insert(_conn, read, _message, _committed=None) -> InsertResult:
        inserted["overall"] = read.overall
        inserted["csi"] = next(
            item.score for item in read.characteristics if item.id == "cross-service-integrity"
        )
        inserted["reasoning"] = next(
            item.reasoning
            for item in read.characteristics
            if item.id == "cross-service-integrity"
        )
        return InsertResult("sha:run", False)

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

    def fake_insert(_conn, read, _message, _committed=None) -> InsertResult:
        inserted["reasoner"] = read.reasoner
        inserted["overall"] = read.overall
        return InsertResult("sha:run", False)

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


SAMPLE = {
    "runId": "r1",
    "commitSha": "a" * 40,
    "commitMessage": "test",
    "timestamp": "2026-08-17T00:00:00Z",
    "archTests": [],
    "runtime": {},
    "ruleSetVersion": 8,
}


def test_receive_payload_enqueues_when_topic_set(monkeypatch) -> None:
    published: dict[str, object] = {}
    invoked = {"called": False}

    monkeypatch.setenv("REASON_TOPIC", "projects/p/topics/analysis-reason")
    monkeypatch.setattr(
        "health_agent.receiver.reason_topic",
        lambda: "projects/p/topics/analysis-reason",
    )
    monkeypatch.setattr("health_agent.receiver.connect", lambda: FakeConn())
    monkeypatch.setattr("health_agent.receiver.migrate", lambda _conn: None)
    monkeypatch.setattr("health_agent.receiver.load_active_decisions", lambda _conn: [])
    monkeypatch.setattr("health_agent.receiver.load_recent_reads", lambda _conn: [])
    monkeypatch.setattr("health_agent.receiver.score_payload", lambda *_a, **_k: SCORES)
    monkeypatch.setattr(
        "health_agent.receiver.insert_health_read",
        lambda *_a, **_k: InsertResult("sha:run", False),
    )
    monkeypatch.setattr(
        "health_agent.receiver.invoke_runtime",
        lambda *_a, **_k: invoked.__setitem__("called", True),
    )

    def fake_publish(run_id, payload, scores, prior_reads) -> None:
        published["run_id"] = run_id
        published["overall"] = scores["overall"]
        published["sha"] = payload["commitSha"]
        published["priors"] = prior_reads

    monkeypatch.setattr("health_agent.receiver.publish_reason_job", fake_publish)

    run_id = receive_payload(SAMPLE)
    assert run_id == "sha:run"
    assert published["run_id"] == "sha:run"
    assert published["overall"] == 93
    assert invoked["called"] is False


def test_incomplete_reuse_enqueues_db_scores(monkeypatch) -> None:
    published: dict[str, object] = {}
    db_scores = ScoreResult.model_validate(
        {
            "overall": 55,
            "characteristics": [
                {"id": "boundary-integrity", "score": 55, "signalsUsed": ["ts-arch:rule-3"]},
                {"id": "layering", "score": 100, "signalsUsed": []},
                {"id": "coupling", "score": 100, "signalsUsed": []},
                {"id": "duplication", "score": 100, "signalsUsed": []},
                {"id": "cross-service-integrity", "score": 40, "signalsUsed": []},
            ],
            "services": [],
        }
    )

    monkeypatch.setattr(
        "health_agent.receiver.reason_topic",
        lambda: "projects/p/topics/analysis-reason",
    )
    monkeypatch.setattr("health_agent.receiver.connect", lambda: FakeConn())
    monkeypatch.setattr("health_agent.receiver.migrate", lambda _conn: None)
    monkeypatch.setattr("health_agent.receiver.load_active_decisions", lambda _conn: [])
    monkeypatch.setattr("health_agent.receiver.load_recent_reads", lambda _conn: [])
    monkeypatch.setattr("health_agent.receiver.score_payload", lambda *_a, **_k: SCORES)
    monkeypatch.setattr(
        "health_agent.receiver.insert_health_read",
        lambda *_a, **_k: InsertResult("sha:run", True),
    )
    monkeypatch.setattr(
        "health_agent.receiver.load_score_result",
        lambda _conn, run_id: db_scores if run_id == "sha:run" else SCORES,
    )
    monkeypatch.setattr(
        "health_agent.receiver.publish_reason_job",
        lambda run_id, payload, scores, prior_reads: published.update(
            {"run_id": run_id, "overall": scores["overall"]}
        ),
    )

    run_id = receive_payload(SAMPLE)
    assert run_id == "sha:run"
    assert published["overall"] == 55


def test_incomplete_supersede_enqueues_fresh_scores(monkeypatch) -> None:
    published: dict[str, object] = {}

    monkeypatch.setattr(
        "health_agent.receiver.reason_topic",
        lambda: "projects/p/topics/analysis-reason",
    )
    monkeypatch.setattr("health_agent.receiver.connect", lambda: FakeConn())
    monkeypatch.setattr("health_agent.receiver.migrate", lambda _conn: None)
    monkeypatch.setattr("health_agent.receiver.load_active_decisions", lambda _conn: [])
    monkeypatch.setattr("health_agent.receiver.load_recent_reads", lambda _conn: [])
    monkeypatch.setattr("health_agent.receiver.score_payload", lambda *_a, **_k: SCORES)
    monkeypatch.setattr(
        "health_agent.receiver.insert_health_read",
        lambda *_a, **_k: InsertResult("sha:new", False),
    )
    loaded = {"called": False}
    monkeypatch.setattr(
        "health_agent.receiver.load_score_result",
        lambda *_a, **_k: loaded.__setitem__("called", True) or SCORES,
    )
    monkeypatch.setattr(
        "health_agent.receiver.publish_reason_job",
        lambda run_id, payload, scores, prior_reads: published.update(
            {"run_id": run_id, "overall": scores["overall"]}
        ),
    )

    run_id = receive_payload(SAMPLE)
    assert run_id == "sha:new"
    assert published["overall"] == 93
    assert loaded["called"] is False


def test_reason_scored_run_attaches_prose(monkeypatch, capsys) -> None:
    from health_agent.receiver import reason_scored_run

    attached: dict[str, object] = {}

    monkeypatch.setattr("health_agent.receiver.connect", lambda: FakeConn())

    def fake_invoke(payload, scores=None, prior_reads=None, persist=False):
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
        }

    def fake_attach(_conn, run_id, narratives, **provenance) -> None:
        attached["run_id"] = run_id
        attached["host"] = provenance["host"]

    monkeypatch.setattr("health_agent.receiver.invoke_runtime", fake_invoke)
    monkeypatch.setattr("health_agent.receiver.attach_reasoning", fake_attach)

    run_id = reason_scored_run(
        {
            "runId": "sha:run",
            "payload": SAMPLE,
            "scores": SCORES.model_dump(by_alias=True),
            "priorReads": [],
        }
    )
    err = capsys.readouterr().err
    assert run_id == "sha:run"
    assert attached["run_id"] == "sha:run"
    assert attached["host"] == "agent-runtime"
    assert "agent_returned_numeric=" in err
