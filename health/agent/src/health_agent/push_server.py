from __future__ import annotations

import base64
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import NamedTemporaryFile

from psycopg import Connection

from health_agent.persist import (
    connect,
    insert_health_read,
    load_active_decisions,
    load_recent_reads,
    migrate,
)
from health_agent.reasoner import Reasoner
from health_agent.run import choose_reasoner, produce_health_read, reasoner_name
from health_agent.tracing import flush_traces, setup_tracing, tracer
from health_agent.vertex_memory import choose_memory_bank

SELECTED_REASONER: Reasoner | None = None


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
        with tracer().start_as_current_span("payload_received") as received:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            envelope = json.loads(raw.decode("utf-8"))
            message = envelope.get("message", {})
            data = base64.b64decode(message["data"]).decode("utf-8")
            payload = json.loads(data)
            received.set_attribute("run.id", str(payload.get("runId", "")))
            received.set_attribute("commit.sha", str(payload.get("commitSha", "")))
            with NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
                handle.write(data)
                path = Path(handle.name)
            decisions_path: Path | None = None
            conn: Connection | None = None
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
                insert_health_read(conn, read, str(payload.get("commitMessage", "")))
                conn.close()
                conn = None
            finally:
                if conn is not None:
                    conn.close()
                path.unlink(missing_ok=True)
                if decisions_path is not None:
                    decisions_path.unlink(missing_ok=True)
                flush_traces()
        self.send_response(204)
        self.end_headers()

    def log_message(self, format: str, *args: object) -> None:
        print(format % args)


def main() -> None:
    global SELECTED_REASONER
    setup_tracing()
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
