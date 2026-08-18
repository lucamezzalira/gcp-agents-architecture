import json

from health_agent.reason_queue import decode_reason_job, encode_reason_job


def test_reason_job_round_trip() -> None:
    payload = {
        "runId": "r1",
        "commitSha": "a" * 40,
        "commitMessage": "test",
        "timestamp": "2026-08-17T00:00:00Z",
        "archTests": [],
        "runtime": {},
        "ruleSetVersion": 8,
    }
    scores = {
        "overall": 95,
        "characteristics": [
            {"id": "layering", "score": 100, "signalsUsed": []},
        ],
        "services": [],
    }
    body = encode_reason_job("sha:run", payload, scores, [])
    envelope = {
        "message": {
            "data": __import__("base64")
            .b64encode(json.dumps(body).encode("utf-8"))
            .decode("ascii")
        }
    }
    decoded = decode_reason_job(json.dumps(envelope).encode("utf-8"))
    assert decoded["runId"] == "sha:run"
    assert decoded["scores"]["overall"] == 95
    assert decoded["payload"]["commitSha"] == "a" * 40
