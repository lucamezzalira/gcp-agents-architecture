from __future__ import annotations

import os

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor

_TRACER_NAME = "health-agent"
_provider: TracerProvider | None = None


def setup_tracing() -> TracerProvider:
    global _provider
    if _provider is not None:
        return _provider
    resource = Resource.create({"service.name": "health-agent"})
    provider = TracerProvider(resource=resource)
    if os.environ.get("K_SERVICE"):
        from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter

        exporter = CloudTraceSpanExporter(
            project_id=os.environ.get("GOOGLE_CLOUD_PROJECT")
        )
        provider.add_span_processor(SimpleSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    _provider = provider
    return provider


def attach_test_provider(provider: TracerProvider) -> None:
    global _provider
    _provider = provider
    trace.set_tracer_provider(provider)


def flush_traces() -> None:
    if _provider is not None:
        _provider.force_flush(timeout_millis=10_000)


def tracer() -> trace.Tracer:
    return trace.get_tracer(_TRACER_NAME)


def current_trace_id() -> str | None:
    span = trace.get_current_span()
    ctx = span.get_span_context()
    if ctx is None or not ctx.is_valid:
        return None
    return format(ctx.trace_id, "032x")
