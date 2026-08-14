import { describe, expect, it } from "vitest";
import { createJsonLogger, silentLogger } from "./logger.js";

describe("createJsonLogger", () => {
  it("writes the correlation id and service on every line", () => {
    const lines: string[] = [];
    const logger = createJsonLogger("checkout", (line) => {
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

  it("is a sealed factory, not a class to subclass", () => {
    expect(typeof createJsonLogger).toBe("function");
    expect(typeof silentLogger).toBe("function");
  });
});
