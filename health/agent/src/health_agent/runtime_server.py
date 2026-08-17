from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from health_agent.models import AnalysisPayload

SELECTED_REASONER: object | None = None


def _ensure_reasoner() -> object:
    global SELECTED_REASONER
    if SELECTED_REASONER is None:
        from health_agent.host import resolve_model, resolved_host
        from health_agent.reason import choose_reasoner, reasoner_name
        from health_agent.vertex_memory import choose_memory_bank

        SELECTED_REASONER = choose_reasoner()
        choose_memory_bank()
        print(
            f"runtime initialised reasoner={reasoner_name(SELECTED_REASONER)} "
            f"model={resolve_model()} host={resolved_host()}",
            flush=True,
        )
    return SELECTED_REASONER


class HealthRuntimeAgent:
    """Agent Engine query target. Scores arrive already computed. No Postgres."""

    def query(
        self,
        payload: dict[str, Any] | None = None,
        scores: dict[str, Any] | None = None,
        prior_reads: list[dict[str, Any]] | None = None,
        persist: bool = False,
        **_ignored: object,
    ) -> dict[str, Any]:
        del persist
        if not isinstance(payload, dict) or "commitSha" not in payload:
            return {"ok": True, "host": "agent-runtime"}
        from health_agent.reason import agent_output, reason_over_scores
        from health_agent.narratives import priors_from_dicts, scores_from_dict
        from health_agent.tracing import flush_traces, setup_tracing
        from health_agent.vertex_memory import choose_memory_bank

        setup_tracing()
        parsed = AnalysisPayload.model_validate(payload)
        scored = scores_from_dict(scores)
        reasoner = _ensure_reasoner()
        narratives, provenance = reason_over_scores(
            parsed,
            scored,
            reasoner,
            prior_reads=priors_from_dicts(prior_reads),
            memory=choose_memory_bank(),
        )
        try:
            return agent_output(narratives, provenance)
        finally:
            flush_traces()

    def stream_query(
        self,
        payload: dict[str, Any] | None = None,
        scores: dict[str, Any] | None = None,
        prior_reads: list[dict[str, Any]] | None = None,
        persist: bool = False,
        **_ignored: object,
    ):
        yield {
            "output": self.query(
                payload, scores=scores, prior_reads=prior_reads, persist=persist
            )
        }


AGENT = HealthRuntimeAgent()


class RuntimeHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path in ("/", "/health", "/healthz", "/api/reasoning_engine"):
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", "2")
            self.end_headers()
            self.wfile.write(b"ok")
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self) -> None:
        if self.path == "/api/reasoning_engine":
            self._unary()
            return
        if self.path == "/api/stream_reasoning_engine":
            self._stream()
            return
        self.send_response(404)
        self.end_headers()

    def _read_request(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = json.loads(self.rfile.read(length).decode("utf-8"))
        if not isinstance(raw, dict):
            raise ValueError("request body must be an object")
        return raw

    def _invoke(self, body: dict[str, Any]) -> Any:
        method_name = str(body.get("class_method") or "query")
        method = getattr(AGENT, method_name, None)
        if method is None:
            raise AttributeError(method_name)
        raw_input = body.get("input") or {}
        if not isinstance(raw_input, dict):
            raise ValueError("input must be an object")
        return method(**raw_input)

    def _unary(self) -> None:
        try:
            body = self._read_request()
            output = self._invoke(body)
            payload = json.dumps({"output": output}).encode("utf-8")
        except AttributeError as exc:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(
                json.dumps({"error": f"Method {exc} not found on agent"}).encode("utf-8")
            )
            return
        except Exception as exc:
            print(f"runtime_query_failed={type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
            self.send_response(500)
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(exc)}).encode("utf-8"))
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(payload)

    def _stream(self) -> None:
        try:
            body = self._read_request()
            output = self._invoke(body)
        except Exception as exc:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(exc)}).encode("utf-8"))
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        chunks = output if _is_iterable(output) else [{"output": output}]
        for chunk in chunks:
            self.wfile.write((json.dumps(chunk) + "\n").encode("utf-8"))
            self.wfile.flush()

    def log_message(self, format: str, *args: object) -> None:
        print(format % args, flush=True)


def _is_iterable(value: object) -> bool:
    if isinstance(value, (str, bytes, dict)):
        return False
    return hasattr(value, "__iter__")


def main() -> None:
    os.environ.setdefault("HEALTH_HOST", "agent-runtime")
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), RuntimeHandler)
    print(f"health agent runtime on {port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
