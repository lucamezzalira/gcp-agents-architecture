from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from health_agent.reasoner import StubReasoner
from health_agent.run import produce_health_read
from health_agent.score_bridge import repo_root
from health_agent.tracing import attach_test_provider


def test_a_run_emits_a_trace_with_named_stages_and_run_id() -> None:
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    attach_test_provider(provider)

    payload_path = (
        repo_root() / "health" / "scoring" / "fixtures" / "zero-findings.json"
    )
    read = produce_health_read(payload_path, reasoner=StubReasoner())
    names = {span.name for span in exporter.get_finished_spans()}
    assert "health_run" in names
    assert "scoring" in names
    assert "memory_retrieve" in names
    assert "reasoning" in names
    assert "memory_write" in names
    assert read.traceId
    root = next(
        span for span in exporter.get_finished_spans() if span.name == "health_run"
    )
    assert root.attributes["run.id"] == read.runId
    assert root.attributes["commit.sha"] == read.commitSha
