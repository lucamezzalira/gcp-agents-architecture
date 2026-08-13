import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import type { CorrelatedLogger, LogFields, Logger } from "../domain/logger.js";

type RecordedLine = {
  level: "info" | "warn" | "error";
  event: string;
  correlationId: string;
};

class RecordingLogger implements Logger {
  readonly lines: RecordedLine[] = [];

  withCorrelation(correlationId: string): CorrelatedLogger {
    const record =
      (level: RecordedLine["level"]) =>
      (event: string, _fields?: LogFields): void => {
        this.lines.push({ level, event, correlationId });
      };
    return {
      info: record("info"),
      warn: record("warn"),
      error: record("error"),
    };
  }
}

describe("correlation id", () => {
  it("is present on every log line for a single order", async () => {
    const logger = new RecordingLogger();
    const app = createApp(logger);

    const created = await app.server.inject({
      method: "POST",
      url: "/orders",
      payload: { id: "ord-1", email: "buyer@example.com" },
    });
    expect(created.statusCode).toBe(201);

    const paid = await app.server.inject({
      method: "POST",
      url: "/orders/ord-1/pay",
    });
    expect(paid.statusCode).toBe(200);

    const orderLines = logger.lines.filter(
      (line) => line.correlationId === "ord-1",
    );
    expect(orderLines.length).toBeGreaterThan(0);
    expect(orderLines).toHaveLength(logger.lines.length);
    await app.server.close();
  });
});
