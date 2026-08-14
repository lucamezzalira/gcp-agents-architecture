import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkObservability } from "./observability.js";

const fixtures = join(import.meta.dirname, "fixtures");

describe("rule 10 observability", () => {
  it("fails when a service clones the logger or boots its own tracer", async () => {
    const result = await checkObservability(join(fixtures, "rule-10/tsconfig.json"));
    expect(result.passed).toBe(false);
    expect(result.violations.map((item) => item.file).sort()).toEqual([
      "services/checkout/src/logger.ts",
      "services/notification/src",
      "services/notification/src/boot.ts",
    ]);
  });

  it("passes when the service imports the package as-is", async () => {
    const result = await checkObservability(
      join(fixtures, "rule-10-pass/tsconfig.json"),
    );
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });
});
