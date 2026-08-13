import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { score } from "../src/score.js";
import {
  acceptedDecisionSchema,
  analysisPayloadSchema,
} from "../src/schemas.js";
import type { AcceptedDecision, AnalysisPayload } from "../src/types.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

function loadFixture<T>(
  name: string,
  parse: (value: unknown) => T,
): T {
  const raw: unknown = JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
  return parse(raw);
}

const zeroFindings = loadFixture("zero-findings.json", (value) =>
  analysisPayloadSchema.parse(value),
);
const rule3Violation = loadFixture("rule-3-violation.json", (value) =>
  analysisPayloadSchema.parse(value),
);
const rule3Decision = loadFixture("rule-3-accepted-decision.json", (value) =>
  acceptedDecisionSchema.parse(value),
);

function characteristic(
  result: ReturnType<typeof score>,
  id: string,
) {
  const found = result.characteristics.find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(`missing characteristic ${id}`);
  }
  return found;
}

describe("score", () => {
  it("scores every characteristic 100 when there are no findings", () => {
    const result = score(zeroFindings, []);
    expect(result.characteristics.map((item) => item.score)).toEqual([
      100, 100, 100, 100,
    ]);
    expect(result.overall).toBe(100);
  });

  it("drops boundary-integrity for a rule-3 violation and records the signal", () => {
    const result = score(rule3Violation, []);
    const boundary = characteristic(result, "boundary-integrity");
    expect(boundary.score).toBeLessThan(100);
    expect(boundary.score).toBe(60);
    expect(boundary.signalsUsed).toContain(
      "ts-arch:rule-3:services/checkout/src/infrastructure/email-provider.ts",
    );
    expect(result.overall).toBe(84);
  });

  it("returns byte-identical output for the same payload twice", () => {
    const first = JSON.stringify(score(rule3Violation, []));
    const second = JSON.stringify(score(rule3Violation, []));
    expect(first).toBe(second);
  });

  it("suppresses the penalty when an active decision matches the violation", () => {
    const result = score(rule3Violation, [rule3Decision]);
    const boundary = characteristic(result, "boundary-integrity");
    expect(boundary.score).toBe(100);
    expect(boundary.suppressedBy).toEqual([
      "decision-rule-3-checkout-provider",
    ]);
    expect(boundary.signalsUsed).toEqual([]);
    expect(result.overall).toBe(100);
  });

  it("does not change scores when runtime signals change", () => {
    const withExtraSignal: AnalysisPayload = {
      ...zeroFindings,
      runtime: {
        illustrative: true,
        signals: [
          ...zeroFindings.runtime.signals,
          { name: "error-rate", value: 0.02, unit: "ratio" },
        ],
      },
    };
    expect(score(withExtraSignal, [])).toEqual(score(zeroFindings, []));
  });

  it("does not suppress when the matching decision is inactive", () => {
    const result = score(rule3Violation, [
      { ...rule3Decision, active: false },
    ]);
    expect(characteristic(result, "boundary-integrity").score).toBe(60);
    expect(
      characteristic(result, "boundary-integrity").suppressedBy,
    ).toBeUndefined();
  });
});
