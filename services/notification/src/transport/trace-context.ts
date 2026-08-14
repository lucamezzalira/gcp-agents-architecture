import { context, propagation, trace } from "@opentelemetry/api";
import type { FastifyInstance, FastifyRequest } from "fastify";

const SERVICE = "notification";

function headerValue(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return undefined;
}

export function registerTraceHook(app: FastifyInstance): void {
  app.addHook("onRequest", (request, _reply, done) => {
    const span = trace.getActiveSpan();
    if (span === undefined) {
      done();
      return;
    }
    span.setAttribute("ga.service", SERVICE);
    span.setAttribute("ga.kind", "server");
    span.setAttribute("ga.protocol", "http");
    const caller = headerValue(request.headers["x-ga-service"]);
    if (caller !== undefined) {
      span.setAttribute("ga.peer", caller);
    }
    done();
  });
}

export async function withPubSubConsumeFromAttributes<T>(
  attributes: Record<string, string> | undefined,
  work: () => Promise<T>,
): Promise<T> {
  const extracted = propagation.extract(context.active(), attributes ?? {}, {
    get: (map, key) => map[key],
    keys: (map) => Object.keys(map),
  });
  const tracer = trace.getTracer(SERVICE);
  return context.with(extracted, () =>
    tracer.startActiveSpan("pubsub.consume", async (span) => {
      span.setAttribute("ga.service", SERVICE);
      span.setAttribute("ga.protocol", "pubsub");
      span.setAttribute("ga.kind", "consumer");
      const peer = attributes?.["ga.service"];
      if (peer !== undefined && peer.length > 0) {
        span.setAttribute("ga.peer", peer);
      }
      try {
        return await work();
      } finally {
        span.end();
      }
    }),
  );
}

export async function withPubSubConsume<T>(
  request: FastifyRequest,
  work: () => Promise<T>,
): Promise<T> {
  return withPubSubConsumeFromAttributes(
    pubsubAttributesFrom(request.body),
    work,
  );
}

function pubsubAttributesFrom(
  body: unknown,
): Record<string, string> | undefined {
  if (typeof body !== "object" || body === null || !("message" in body)) {
    return undefined;
  }
  const message = (body as { message: unknown }).message;
  if (typeof message !== "object" || message === null) {
    return undefined;
  }
  if (!("attributes" in message)) {
    return undefined;
  }
  const raw = (message as { attributes: unknown }).attributes;
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      attributes[key] = value;
    }
  }
  return attributes;
}
