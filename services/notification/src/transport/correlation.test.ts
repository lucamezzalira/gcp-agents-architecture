import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import type { CorrelatedLogger, LogFields, Logger } from "@observability/runtime";

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

const instruction = {
  messageId: "msg-1",
  to: "buyer@example.com",
  subject: "Your order",
  bodyRef: "bodies/order-1.html",
};

describe("correlation id", () => {
  it("is present on every log line for a single instruction", async () => {
    const logger = new RecordingLogger();
    const app = createApp(logger);
    app.bodyStore.put(instruction.bodyRef, "<p>ok</p>");

    const response = await app.server.inject({
      method: "POST",
      url: "/instructions",
      payload: instruction,
    });

    expect(response.statusCode).toBe(200);
    expect(logger.lines.length).toBeGreaterThan(0);
    for (const line of logger.lines) {
      expect(line.correlationId).toBe(instruction.messageId);
    }
    await app.server.close();
  });
});
