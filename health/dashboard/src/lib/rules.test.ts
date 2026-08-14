import { describe, expect, it } from "vitest";
import {
  ARCH_RULES,
  METRIC_SIGNALS,
  RULE_COUNT,
  scoringLine,
} from "./rules.js";

describe("architecture rule catalog", () => {
  it("lists nine rules with a description and a penalty", () => {
    expect(RULE_COUNT).toBe(9);
    expect(ARCH_RULES.map((rule) => rule.id)).toEqual([
      "rule-1",
      "rule-2",
      "rule-3",
      "rule-4",
      "rule-5",
      "rule-6",
      "rule-7",
      "rule-8",
      "rule-9",
    ]);
    for (const rule of ARCH_RULES) {
      expect(rule.title.length).toBeGreaterThan(0);
      expect(rule.description.length).toBeGreaterThan(20);
      expect(rule.penalty).toBeGreaterThan(0);
      expect(scoringLine(rule)).toContain(`Penalty ${rule.penalty}`);
    }
  });

  it("double-counts boundary rules on platform CSI", () => {
    const csi = ARCH_RULES.filter((rule) => rule.platformCsi !== undefined);
    expect(csi.map((rule) => rule.id)).toEqual([
      "rule-3",
      "rule-4",
      "rule-5",
      "rule-7",
    ]);
    expect(scoringLine(csi[0]!)).toContain("cross-service-integrity");
  });

  it("documents metric signals that are not architecture rules", () => {
    expect(METRIC_SIGNALS.some((item) => item.id === "efferent-growth")).toBe(
      true,
    );
  });
});
