import { describe, expect, it } from "vitest";
import { JsonLogger } from "./json-logger.js";

describe("JsonLogger", () => {
  it("writes the correlation id on every line", () => {
    const lines: string[] = [];
    const logger = new JsonLogger((line) => {
      lines.push(line);
    });
    const log = logger.withCorrelation("ord-1");
    log.info("mark-paid.started");
    log.warn("mark-paid.not-found");
    log.error("order.pay-failed");

    expect(lines).toHaveLength(3);
    for (const line of lines) {
      const parsed: unknown = JSON.parse(line);
      expect(parsed).toMatchObject({
        service: "checkout",
        correlationId: "ord-1",
      });
    }
  });
});
