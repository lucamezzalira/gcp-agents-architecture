import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkArchitecture } from "./check.js";
import { RULE_IDS } from "./version.js";

const here = dirname(fileURLToPath(import.meta.url));

function fixtureTsconfig(name: string): string {
  return join(here, "fixtures", name, "tsconfig.json");
}

describe("architecture rules on fixtures", () => {
  it.each(RULE_IDS)("%s fails on its violating fixture", async (ruleId) => {
    const results = await checkArchitecture(fixtureTsconfig(ruleId));
    const match = results.find((item) => item.ruleId === ruleId);
    expect(match).toBeDefined();
    expect(match?.passed).toBe(false);
    expect(match?.violations.length).toBeGreaterThan(0);
  });

  it.each(RULE_IDS)("%s passes on its compliant fixture", async (ruleId) => {
    const results = await checkArchitecture(fixtureTsconfig(`${ruleId}-pass`));
    const match = results.find((item) => item.ruleId === ruleId);
    expect(match).toBeDefined();
    expect(match?.passed).toBe(true);
    expect(match?.violations).toEqual([]);
  });

  it("fails rule 2 when infrastructure imports a new domain decision", async () => {
    const results = await checkArchitecture(
      fixtureTsconfig("rule-2-new-decision"),
    );
    const match = results.find((item) => item.ruleId === "rule-2");
    expect(match?.passed).toBe(false);
    expect(match?.violations.some((item) => item.detail.includes("cancel-order"))).toBe(
      true,
    );
  });
});
