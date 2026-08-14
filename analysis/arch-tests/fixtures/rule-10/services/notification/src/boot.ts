import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export function boot(): NodeTracerProvider {
  return new NodeTracerProvider();
}
