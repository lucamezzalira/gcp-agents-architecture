import { context, propagation, trace } from "@opentelemetry/api";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { Resource } from "@opentelemetry/resources";
import {
  NodeTracerProvider,
  SimpleSpanProcessor,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-node";

let serviceName = "inventory";
let started = false;

export function currentService(): string {
  return process.env.OTEL_SERVICE_NAME ?? serviceName;
}

function shouldExport(): boolean {
  return (
    (process.env.K_SERVICE !== undefined && process.env.K_SERVICE.length > 0) ||
    process.env.TRACE_EXPORT === "1"
  );
}

export async function startTracing(name: string): Promise<void> {
  serviceName = name;
  if (started) {
    return;
  }
  started = true;
  const provider = new NodeTracerProvider({
    resource: new Resource({ "service.name": name }),
  });
  const stamp: SpanProcessor = {
    onStart(span) {
      span.setAttribute("ga.service", name);
    },
    onEnd() {},
    shutdown() {
      return Promise.resolve();
    },
    forceFlush() {
      return Promise.resolve();
    },
  };
  provider.addSpanProcessor(stamp);
  if (shouldExport()) {
    const { TraceExporter } = await import(
      "@google-cloud/opentelemetry-cloud-trace-exporter"
    );
    provider.addSpanProcessor(new SimpleSpanProcessor(new TraceExporter()));
  }
  provider.register();
  registerInstrumentations({
    instrumentations: [new HttpInstrumentation()],
  });
}

export async function tracedFetch(
  url: string,
  init: RequestInit,
  peer: string,
): Promise<Response> {
  const tracer = trace.getTracer(currentService());
  return tracer.startActiveSpan(
    `http ${init.method ?? "GET"} ${peer}`,
    async (span) => {
      span.setAttribute("ga.service", currentService());
      span.setAttribute("ga.peer", peer);
      span.setAttribute("ga.protocol", "http");
      span.setAttribute("ga.kind", "client");
      span.setAttribute("http.url", url);
      const headers = new Headers(init.headers);
      headers.set("x-ga-service", currentService());
      headers.set("x-ga-peer", peer);
      propagation.inject(context.active(), headers, {
        set: (carrier, key, value) => {
          carrier.set(key, value);
        },
      });
      try {
        const response = await fetch(url, { ...init, headers });
        span.setAttribute("http.status_code", response.status);
        return response;
      } finally {
        span.end();
      }
    },
  );
}

export function pubsubAttributes(peer: string): Record<string, string> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  carrier["ga.service"] = currentService();
  carrier["ga.peer"] = peer;
  carrier["ga.protocol"] = "pubsub";
  carrier["ga.kind"] = "producer";
  return carrier;
}

export async function withProducerSpan<T>(
  name: string,
  peer: string,
  work: (attributes: Record<string, string>) => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer(currentService());
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute("ga.service", currentService());
    span.setAttribute("ga.peer", peer);
    span.setAttribute("ga.protocol", "pubsub");
    span.setAttribute("ga.kind", "producer");
    try {
      return await work(pubsubAttributes(peer));
    } finally {
      span.end();
    }
  });
}
