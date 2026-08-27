import json
from http.client import HTTPConnection
from threading import Thread

from health_agent.models import ScoreResult
from health_agent.narratives import narratives_from_agent, numeric_fields
from health_agent.push_server import decode_push_message, handle_payload
from health_agent.runtime_server import AGENT, RuntimeHandler
from http.server import ThreadingHTTPServer


MIN_SCORES = ScoreResult.model_validate(
    {
        "overall": 93,
        "characteristics": [
            {"id": "boundary-integrity", "score": 100, "signalsUsed": []},
            {"id": "layering", "score": 100, "signalsUsed": []},
            {"id": "coupling", "score": 100, "signalsUsed": []},
            {"id": "duplication", "score": 100, "signalsUsed": []},
            {"id": "cross-service-integrity", "score": 70, "signalsUsed": ["clone"]},
        ],
    }
)


def _narratives_for(scores: ScoreResult) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    for item in scores.characteristics:
        recs = [] if item.score == 100 else ["fix it"]
        items.append(
            {"id": item.id, "reasoning": f"{item.id} is {item.score}", "recommendations": recs}
        )
    for service in scores.services:
        for item in service.characteristics:
            items.append(
                {
                    "id": f"{service.service}:{item.id}",
                    "reasoning": f"{service.service} {item.id}",
                    "recommendations": [],
                }
            )
    return items


def test_decode_push_message_validates_payload() -> None:
    payload = {
        "runId": "r1",
        "commitSha": "a" * 40,
        "commitMessage": "test",
        "timestamp": "2026-08-17T00:00:00Z",
        "archTests": [],
        "runtime": {},
    }
    encoded = json.dumps(payload).encode("utf-8")
    import base64

    envelope = json.dumps(
        {"message": {"data": base64.b64encode(encoded).decode("ascii")}}
    ).encode("utf-8")
    parsed = decode_push_message(envelope)
    assert parsed["runId"] == "r1"


def test_receiver_scores_then_invokes_runtime(monkeypatch) -> None:
    called: dict[str, object] = {}

    def fake_receive(payload: dict[str, object]) -> str:
        called["payload"] = payload
        return "sha:run"

    monkeypatch.setenv("AGENT_RUNTIME_ID", "123")
    monkeypatch.setattr("health_agent.receiver.receive_payload", fake_receive)
    handle_payload(
        {
            "runId": "r1",
            "commitSha": "a" * 40,
            "commitMessage": "test",
            "timestamp": "2026-08-17T00:00:00Z",
            "archTests": [],
            "runtime": {},
        }
    )
    assert called["payload"]["runId"] == "r1"


def test_handle_payload_requires_agent_runtime_id(monkeypatch) -> None:
    monkeypatch.delenv("AGENT_RUNTIME_ID", raising=False)
    try:
        handle_payload(
            {
                "runId": "r1",
                "commitSha": "a" * 40,
                "commitMessage": "test",
                "timestamp": "2026-08-17T00:00:00Z",
                "archTests": [],
                "runtime": {},
            }
        )
        raise AssertionError("expected AGENT_RUNTIME_ID requirement")
    except RuntimeError as exc:
        assert "AGENT_RUNTIME_ID" in str(exc)


def test_numeric_fields_flags_scores_and_overall() -> None:
    found = numeric_fields(
        {
            "overall": 1,
            "characteristics": [{"id": "layering", "score": 100, "reasoning": "ok"}],
            "narratives": [{"id": "layering", "reasoning": "ok", "recommendations": []}],
        }
    )
    assert "overall" in found
    assert any(item.endswith("score") for item in found)


def test_narratives_from_agent_ignores_numeric_output(capsys) -> None:
    output = {
        "overall": 1,
        "scores": {"overall": 1},
        "characteristics": [
            {
                "id": item.id,
                "score": 0,
                "reasoning": f"{item.id} prose",
                "recommendations": ["ignore the zero"],
            }
            for item in MIN_SCORES.characteristics
        ],
        "narratives": _narratives_for(MIN_SCORES),
    }
    narratives = narratives_from_agent(output, MIN_SCORES)
    err = capsys.readouterr().err
    assert "agent_returned_numeric=" in err
    by_id = {item.id: item for item in narratives}
    assert by_id["cross-service-integrity"].reasoning == "cross-service-integrity is 70"
    assert by_id["boundary-integrity"].recommendations == []
    assert all(item.id != "overall" for item in narratives)


def test_runtime_query_requires_scores() -> None:
    try:
        AGENT.query(
            payload={
                "runId": "r1",
                "commitSha": "a" * 40,
                "commitMessage": "test",
                "timestamp": "2026-08-17T00:00:00Z",
                "archTests": [],
                "runtime": {},
            }
        )
        raise AssertionError("query must reject a payload with no scores")
    except ValueError as exc:
        assert "does not compute" in str(exc)


def test_runtime_query_does_not_import_persist_or_scoring(monkeypatch) -> None:
    monkeypatch.setenv("HEALTH_REASONER", "stub")
    monkeypatch.delenv("K_SERVICE", raising=False)
    monkeypatch.delenv("HEALTH_HOST", raising=False)
    from health_agent.reason import agent_output

    captured: dict[str, object] = {}

    def fake_reason(payload, scores, reasoner, prior_reads=None, memory=None):
        captured["scores"] = scores
        from health_agent.models import Narrative

        narratives = [
            Narrative(id=item.id, reasoning="ok", recommendations=[])
            for item in scores.characteristics
        ]
        return narratives, {
            "reasoner": "stub",
            "host": "agent-runtime",
            "model": None,
            "traceId": "abc",
            "agentIdentity": None,
        }

    monkeypatch.setattr("health_agent.reason.reason_over_scores", fake_reason)
    output = AGENT.query(
        payload={
            "runId": "r1",
            "commitSha": "a" * 40,
            "commitMessage": "test",
            "timestamp": "2026-08-17T00:00:00Z",
            "archTests": [],
            "runtime": {},
        },
        scores=MIN_SCORES.model_dump(),
    )
    assert "narratives" in output
    assert "overall" not in output
    assert captured["scores"].overall == 93
    del agent_output


def test_reasoning_engine_unary_wraps_output(monkeypatch) -> None:
    monkeypatch.setattr(
        AGENT,
        "query",
        lambda payload, persist=False, **_k: {
            "narratives": [],
            "host": "agent-runtime",
        },
    )
    server = ThreadingHTTPServer(("127.0.0.1", 0), RuntimeHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = server.server_address
        conn = HTTPConnection(host, port, timeout=5)
        body = json.dumps(
            {
                "class_method": "query",
                "input": {
                    "payload": {"commitSha": "abc"},
                    "scores": MIN_SCORES.model_dump(),
                },
            }
        )
        conn.request("POST", "/api/reasoning_engine", body=body)
        response = conn.getresponse()
        assert response.status == 200
        payload = json.loads(response.read().decode("utf-8"))
        assert payload == {
            "output": {"narratives": [], "host": "agent-runtime"}
        }
        conn.close()
    finally:
        server.shutdown()


def test_runtime_health_get_is_ok() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 0), RuntimeHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = server.server_address
        conn = HTTPConnection(host, port, timeout=5)
        conn.request("GET", "/health")
        response = conn.getresponse()
        assert response.status == 200
        assert response.read() == b"ok"
        conn.close()
    finally:
        server.shutdown()


def test_probe_query_with_message_is_ok() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 0), RuntimeHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = server.server_address
        conn = HTTPConnection(host, port, timeout=5)
        body = json.dumps(
            {
                "class_method": "query",
                "input": {"message": "What is the capital of France?"},
            }
        )
        conn.request("POST", "/api/reasoning_engine", body=body)
        response = conn.getresponse()
        assert response.status == 200
        payload = json.loads(response.read().decode("utf-8"))
        assert payload["output"]["ok"] is True
        conn.close()
    finally:
        server.shutdown()
