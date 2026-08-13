import { describe, expect, it } from "vitest";
import { globMatch, matchingDecision } from "../src/suppress.js";
import type { AcceptedDecision } from "../src/types.js";

const decision = (pathGlob: string): AcceptedDecision => ({
  id: "d1",
  ruleId: "rule-3",
  pathGlob,
  decision: "accept",
  rationale: "test",
  decidedBy: "test",
  decidedAt: "2026-01-01T00:00:00.000Z",
  active: true,
});

describe("globMatch", () => {
  it("matches nested files under a trailing **", () => {
    expect(
      globMatch(
        "services/checkout/**",
        "services/checkout/src/infrastructure/email-provider.ts",
      ),
    ).toBe(true);
  });

  it("matches a file in the glob directory with **/*", () => {
    expect(
      globMatch("services/checkout/**/*.ts", "services/checkout/render.ts"),
    ).toBe(true);
  });

  it("does not match a different service", () => {
    expect(
      globMatch(
        "services/checkout/**",
        "services/notification/src/infrastructure/email-provider.ts",
      ),
    ).toBe(false);
  });
});

describe("matchingDecision", () => {
  it("returns the active decision whose glob covers a finding path", () => {
    const found = matchingDecision(
      {
        ruleId: "rule-3",
        paths: ["services/checkout/src/infrastructure/email-provider.ts"],
      },
      [decision("services/checkout/**")],
    );
    expect(found?.id).toBe("d1");
  });

  it("ignores a decision for a different rule", () => {
    const found = matchingDecision(
      {
        ruleId: "rule-1",
        paths: ["services/checkout/src/infrastructure/email-provider.ts"],
      },
      [decision("services/checkout/**")],
    );
    expect(found).toBeUndefined();
  });
});
