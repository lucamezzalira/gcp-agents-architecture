import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkArchitecture } from "./check.js";
import { RULE_IDS } from "./version.js";

const repoRoot = join(import.meta.dirname, "../..");

describe("architecture guard on the real services", () => {
  it("passes every rule", async () => {
    const results = await checkArchitecture(join(repoRoot, "tsconfig.arch.json"));
    expect(results.map((item) => item.ruleId)).toEqual([...RULE_IDS]);
    for (const item of results) {
      expect(item.passed, `${item.ruleId} ${JSON.stringify(item.violations)}`).toBe(
        true,
      );
    }
  });
});
