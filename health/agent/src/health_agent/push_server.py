from __future__ import annotations

import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from health_agent.models import AnalysisPayload
from health_agent.tracing import flush_traces, setup_tracing, tracer


def runtime_id() -> str:
    return os.environ.get("AGENT_RUNTIME_ID", "").strip()


def decode_push_message(raw: bytes) -> dict[str, Any]:
    from health_agent.pubsub_envelope import decode_pubsub_data

    payload = decode_pubsub_data(raw)
    if not isinstance(payload, dict):
        raise ValueError("Pub/Sub message is not an object")
    AnalysisPayload.model_validate(payload)
    return payload


def handle_payload(payload: dict[str, Any]) -> None:
    if not runtime_id():
        raise RuntimeError("AGENT_RUNTIME_ID is required")
    from health_agent.receiver import receive_payload

    receive_payload(payload)


def handle_reason(raw: bytes) -> None:
    from health_agent.reason_queue import decode_reason_job
    from health_agent.receiver import reason_scored_run

    reason_scored_run(decode_reason_job(raw))


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
    setup_tracing()
    if not runtime_id():
        print(
            "AGENT_RUNTIME_ID is required",
            file=sys.stderr,
            flush=True,
        )
        raise SystemExit(1)
    from health_agent.persist import connect, migrate

    conn = connect()
    migrate(conn)
    conn.close()
    print(
        f"push receiver initialised runtime={runtime_id()} scoring=local",
        flush=True,
    )
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), PushHandler)
    print(f"health agent push server on {port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
