from __future__ import annotations

import base64
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any

from health_agent.models import AnalysisPayload
from health_agent.tracing import flush_traces, setup_tracing, tracer

from health_agent.reasoner import Reasoner

SELECTED_REASONER: Reasoner | None = None


def runtime_id() -> str:
    return os.environ.get("AGENT_RUNTIME_ID", "").strip()


def decode_push_message(raw: bytes) -> dict[str, Any]:
    envelope = json.loads(raw.decode("utf-8"))
    message = envelope.get("message", {})
    if not isinstance(message, dict):
        raise ValueError("Pub/Sub envelope is missing message")
    data = base64.b64decode(message["data"]).decode("utf-8")
    payload = json.loads(data)
    if not isinstance(payload, dict):
        raise ValueError("Pub/Sub message is not an object")
    AnalysisPayload.model_validate(payload)
    return payload


def handle_payload(payload: dict[str, Any]) -> None:
    if runtime_id():
        from health_agent.receiver import receive_payload

        receive_payload(payload)
        return
    _legacy_produce(payload)


def handle_reason(raw: bytes) -> None:
    from health_agent.reason_queue import decode_reason_job
    from health_agent.receiver import reason_scored_run

    reason_scored_run(decode_reason_job(raw))


def _legacy_produce(payload: dict[str, Any]) -> None:
    from health_agent.persist import (
        connect,
        insert_health_read,
        iso_or_none,
        load_active_decisions,
        load_recent_reads,
    )
    from health_agent.run import produce_health_read
    from health_agent.vertex_memory import choose_memory_bank

    with NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
        handle.write(json.dumps(payload))
        path = Path(handle.name)
    decisions_path: Path | None = None
    conn = None
    try:
        conn = connect()
        decisions = load_active_decisions(conn)
        with NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            handle.write(json.dumps(decisions))
            decisions_path = Path(handle.name)
        prior_reads = load_recent_reads(conn)
        conn.commit()
        conn.close()
        conn = None
        if SELECTED_REASONER is None:
            raise RuntimeError("reasoner was not initialised at startup")
        read = produce_health_read(
            path,
            decisions_path,
            reasoner=SELECTED_REASONER,
            prior_reads=prior_reads,
            memory=choose_memory_bank(),
        )
        conn = connect()
        insert_health_read(
            conn,
            read,
            str(payload.get("commitMessage", "")),
            iso_or_none(payload.get("committedAt")),
        )
        conn.close()
        conn = None
    finally:
        if conn is not None:
            conn.close()
        path.unlink(missing_ok=True)
        if decisions_path is not None:
            decisions_path.unlink(missing_ok=True)


class PushHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path in ("/", "/health"):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        path = self.path.split("?", 1)[0]
        if path == "/reason":
            with tracer().start_as_current_span("reason_received"):
                handle_reason(raw)
                flush_traces()
            self.send_response(204)
            self.end_headers()
            return
        with tracer().start_as_current_span("payload_received") as received:
            payload = decode_push_message(raw)
            received.set_attribute("run.id", str(payload.get("runId", "")))
            received.set_attribute("commit.sha", str(payload.get("commitSha", "")))
            handle_payload(payload)
            flush_traces()
        self.send_response(204)
        self.end_headers()

    def log_message(self, format: str, *args: object) -> None:
        print(format % args)


def main() -> None:
    global SELECTED_REASONER
    setup_tracing()
    if runtime_id():
        from health_agent.persist import connect, migrate

        conn = connect()
        migrate(conn)
        conn.close()
        print(
            f"push receiver initialised runtime={runtime_id()} scoring=local",
            flush=True,
        )
    else:
        from health_agent.persist import connect, migrate
        from health_agent.reason import choose_reasoner, reasoner_name
        from health_agent.vertex_memory import choose_memory_bank

        try:
            SELECTED_REASONER = choose_reasoner()
            choose_memory_bank()
        except Exception as exc:
            print(f"reasoner startup failed: {exc}", file=sys.stderr, flush=True)
            raise SystemExit(1) from exc
        print(f"reasoner initialised: {reasoner_name(SELECTED_REASONER)}", flush=True)
        conn = connect()
        migrate(conn)
        conn.close()
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), PushHandler)
    print(f"health agent push server on {port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
