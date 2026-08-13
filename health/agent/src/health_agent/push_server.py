from __future__ import annotations

import base64
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import NamedTemporaryFile

from health_agent.persist import (
    connect,
    insert_health_read,
    load_active_decisions,
    load_recent_reads,
    migrate,
)
from health_agent.run import produce_health_read


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
        envelope = json.loads(raw.decode("utf-8"))
        message = envelope.get("message", {})
        data = base64.b64decode(message["data"]).decode("utf-8")
        with NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            handle.write(data)
            path = Path(handle.name)
        decisions_path: Path | None = None
        try:
            conn = connect()
            migrate(conn)
            decisions = load_active_decisions(conn)
            with NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
                handle.write(json.dumps(decisions))
                decisions_path = Path(handle.name)
            prior_reads = load_recent_reads(conn)
            read = produce_health_read(path, decisions_path, prior_reads=prior_reads)
            payload = json.loads(data)
            insert_health_read(conn, read, str(payload.get("commitMessage", "")))
            conn.close()
        finally:
            path.unlink(missing_ok=True)
            if decisions_path is not None:
                decisions_path.unlink(missing_ok=True)
        self.send_response(204)
        self.end_headers()

    def log_message(self, format: str, *args: object) -> None:
        print(format % args)


def main() -> None:
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), PushHandler)
    print(f"health agent push server on {port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
