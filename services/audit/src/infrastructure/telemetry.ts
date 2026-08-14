import { trace } from "@opentelemetry/api";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { Resource } from "@opentelemetry/resources";
import {
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";

const NAME = "audit";
let booted = false;

export async function bootAuditSpans(): Promise<void> {
  if (booted) {
    return;
  }
  booted = true;
  const provider = new NodeTracerProvider({
    resource: new Resource({ "service.name": NAME }),
  });
  if (process.env.K_SERVICE) {
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

export function stampIntake(peer: string): void {
  const span = trace.getActiveSpan();
  if (span === undefined) {
    return;
  }
  span.setAttribute("ga.service", NAME);
  span.setAttribute("ga.kind", "consumer");
  span.setAttribute("ga.protocol", "pubsub");
  span.setAttribute("ga.peer", peer);
}
