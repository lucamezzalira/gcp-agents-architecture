import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkArchitecture } from "./check.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../..");

function fixtureTsconfig(ruleId: string): string {
  return join(here, "fixtures", ruleId, "tsconfig.json");
}

describe("architecture rules on the real services", () => {
  it("passes all five rules", async () => {
    const results = await checkArchitecture(
      join(repoRoot, "tsconfig.arch.json"),
    );
    expect(results.map((item) => item.ruleId)).toEqual([
      "rule-1",
      "rule-2",
      "rule-3",
      "rule-4",
      "rule-5",
    ]);
    for (const item of results) {
      expect(item.passed, item.ruleId + " " + JSON.stringify(item.violations)).toBe(
        true,
      );
    }
  });
});

describe("architecture rules on fixtures", () => {
  it.each(["rule-1", "rule-2", "rule-3", "rule-4", "rule-5"] as const)(
    "%s fails on its fixture",
    async (ruleId) => {
      const results = await checkArchitecture(fixtureTsconfig(ruleId));
      const match = results.find((item) => item.ruleId === ruleId);
      expect(match).toBeDefined();
      expect(match?.passed).toBe(false);
      expect(match?.violations.length).toBeGreaterThan(0);
    },
  );
});
