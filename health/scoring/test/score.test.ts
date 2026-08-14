import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { classifyClone } from "../src/classify.js";
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

function serviceScore(
  result: ReturnType<typeof score>,
  name: string,
) {
  const found = result.services.find((item) => item.service === name);
  if (found === undefined) {
    throw new Error(`missing service ${name}`);
  }
  return found;
}

function serviceChar(
  result: ReturnType<typeof score>,
  name: string,
  id: string,
) {
  const found = serviceScore(result, name).characteristics.find(
    (item) => item.id === id,
  );
  if (found === undefined) {
    throw new Error(`missing ${name}:${id}`);
  }
  return found;
}

function layerMetrics(
  service: string,
  instability: number,
): AnalysisPayload["dependencyCruiser"]["folderMetrics"] {
  return ["domain", "infrastructure", "transport"].map((layer) => ({
    folder: `services/${service}/src/${layer}`,
    afferentCoupling: 4,
    efferentCoupling: 6,
    instability,
  }));
}

function withGraph(
  payload: AnalysisPayload,
  instability: { checkout: number; notification: number },
): AnalysisPayload {
  return {
    ...payload,
    services: ["checkout", "notification"],
    dependencyCruiser: {
      ...payload.dependencyCruiser,
      folderMetrics: [
        ...layerMetrics("checkout", instability.checkout),
        ...layerMetrics("notification", instability.notification),
      ],
    },
  };
}

describe("score", () => {
  it("scores every characteristic 100 when there are no findings", () => {
    const result = score(zeroFindings, []);
    expect(result.characteristics.map((item) => item.score)).toEqual([
      100, 100, 100, 100, 100,
    ]);
    expect(result.overall).toBe(100);
  });

  it("drops checkout boundary and platform cross-service integrity for rule-3", () => {
    const result = score(rule3Violation, []);
    expect(serviceChar(result, "checkout", "boundary-integrity").score).toBe(60);
    expect(serviceChar(result, "notification", "boundary-integrity").score).toBe(
      100,
    );
    expect(characteristic(result, "boundary-integrity").score).toBe(60);
    expect(characteristic(result, "cross-service-integrity").score).toBe(60);
    expect(
      serviceChar(result, "checkout", "boundary-integrity").signalsUsed,
    ).toContain(
      "ts-arch:rule-3:services/checkout/src/infrastructure/email-provider.ts",
    );
    expect(result.overall).toBe(78);
    expect(serviceScore(result, "checkout").overall).toBe(84);
    expect(serviceScore(result, "notification").overall).toBe(100);
  });

  it("returns byte-identical output for the same payload twice", () => {
    const first = JSON.stringify(score(rule3Violation, []));
    const second = JSON.stringify(score(rule3Violation, []));
    expect(first).toBe(second);
  });

  it("suppresses the penalty when an active decision matches the violation", () => {
    const result = score(rule3Violation, [rule3Decision]);
    expect(serviceChar(result, "checkout", "boundary-integrity").score).toBe(100);
    expect(
      serviceChar(result, "checkout", "boundary-integrity").suppressedBy,
    ).toEqual(["decision-rule-3-checkout-provider"]);
    expect(characteristic(result, "cross-service-integrity").score).toBe(100);
    expect(characteristic(result, "cross-service-integrity").suppressedBy).toEqual(
      ["decision-rule-3-checkout-provider"],
    );
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
    expect(serviceChar(result, "checkout", "boundary-integrity").score).toBe(60);
    expect(
      serviceChar(result, "checkout", "boundary-integrity").suppressedBy,
    ).toBeUndefined();
  });

  it("does not move coupling when folder instability changes", () => {
    const quieter = score(withGraph(zeroFindings, { checkout: 0.2, notification: 0.2 }), []);
    const noisier = score(withGraph(zeroFindings, { checkout: 0.6, notification: 0.2 }), []);
    expect(serviceChar(quieter, "checkout", "coupling").score).toBe(100);
    expect(serviceChar(noisier, "checkout", "coupling").score).toBe(100);
    expect(characteristic(noisier, "coupling").score).toBe(
      characteristic(quieter, "coupling").score,
    );
    expect(noisier.overall).toBe(quieter.overall);
  });

  it("penalises checkout coupling for Ce growth and ignores a Ca rise on notification", () => {
    const payload: AnalysisPayload = {
      ...zeroFindings,
      services: ["checkout", "notification"],
      archTests: [
        {
          ruleId: "rule-5",
          passed: false,
          violations: [
            {
              file: "services/checkout/src/domain/mark-paid.ts",
              detail: "imports notification internals",
              service: "checkout",
            },
          ],
        },
      ],
      dependencyCruiser: {
        ...zeroFindings.dependencyCruiser,
        serviceMetrics: [
          { service: "checkout", afferentCoupling: 0, efferentCoupling: 2 },
          { service: "notification", afferentCoupling: 5, efferentCoupling: 3 },
        ],
      },
      priorServiceMetrics: [
        { service: "checkout", afferentCoupling: 0, efferentCoupling: 1 },
        { service: "notification", afferentCoupling: 4, efferentCoupling: 3 },
      ],
    };
    const result = score(payload, []);
    expect(serviceChar(result, "checkout", "boundary-integrity").score).toBe(75);
    expect(serviceChar(result, "notification", "boundary-integrity").score).toBe(
      100,
    );
    expect(serviceChar(result, "notification", "coupling").score).toBe(100);
    expect(serviceChar(result, "checkout", "coupling").score).toBe(90);
    expect(characteristic(result, "cross-service-integrity").score).toBe(75);
  });

  it("does not penalise a drop in efferent coupling", () => {
    const payload: AnalysisPayload = {
      ...zeroFindings,
      services: ["checkout", "notification"],
      dependencyCruiser: {
        ...zeroFindings.dependencyCruiser,
        serviceMetrics: [
          { service: "checkout", afferentCoupling: 1, efferentCoupling: 2 },
          { service: "notification", afferentCoupling: 4, efferentCoupling: 3 },
        ],
      },
      priorServiceMetrics: [
        { service: "checkout", afferentCoupling: 1, efferentCoupling: 5 },
        { service: "notification", afferentCoupling: 2, efferentCoupling: 3 },
      ],
    };
    const result = score(payload, []);
    expect(serviceChar(result, "checkout", "coupling").score).toBe(100);
    expect(serviceChar(result, "notification", "coupling").score).toBe(100);
  });

  it("scores an improved-metrics run no lower than its predecessor", () => {
    const worse: AnalysisPayload = {
      ...zeroFindings,
      services: ["checkout", "notification"],
      dependencyCruiser: {
        ...zeroFindings.dependencyCruiser,
        cycles: [
          { path: ["services/checkout/src/a.ts", "services/checkout/src/b.ts"] },
          { path: ["services/checkout/src/c.ts", "services/checkout/src/d.ts"] },
        ],
        orphans: [
          "services/checkout/src/orphan-a.ts",
          "services/checkout/src/orphan-b.ts",
        ],
        serviceMetrics: [
          { service: "checkout", afferentCoupling: 1, efferentCoupling: 6 },
          { service: "notification", afferentCoupling: 2, efferentCoupling: 4 },
        ],
      },
      duplication: {
        percentage: 3,
        clones: [
          {
            files: [
              "services/checkout/src/domain/order.ts",
              "services/checkout/src/domain/order-copy.ts",
            ],
            lines: 12,
            tokens: 80,
            classification: "internal",
            services: ["checkout"],
          },
          {
            files: [
              "services/checkout/src/domain/send-instruction.ts",
              "services/notification/src/domain/send-instruction.ts",
            ],
            lines: 20,
            tokens: 90,
            classification: "cross-service",
            services: ["checkout", "notification"],
          },
        ],
      },
    };
    const better: AnalysisPayload = {
      ...worse,
      dependencyCruiser: {
        ...worse.dependencyCruiser,
        cycles: [
          { path: ["services/checkout/src/a.ts", "services/checkout/src/b.ts"] },
        ],
        orphans: ["services/checkout/src/orphan-a.ts"],
        serviceMetrics: [
          { service: "checkout", afferentCoupling: 1, efferentCoupling: 5 },
          { service: "notification", afferentCoupling: 2, efferentCoupling: 4 },
        ],
      },
      duplication: {
        percentage: 1,
        clones: [
          {
            files: [
              "services/checkout/src/domain/send-instruction.ts",
              "services/notification/src/domain/send-instruction.ts",
            ],
            lines: 20,
            tokens: 90,
            classification: "cross-service",
            services: ["checkout", "notification"],
          },
        ],
      },
      priorServiceMetrics: worse.dependencyCruiser.serviceMetrics,
      priorDuplicationCounts: {
        internal: 1,
        crossService: 1,
        shared: 0,
        internalByService: { checkout: 1 },
      },
    };
    const first = score(worse, []);
    const second = score(better, []);
    expect(second.overall).toBeGreaterThanOrEqual(first.overall);
    expect(serviceChar(second, "checkout", "coupling").score).toBeGreaterThanOrEqual(
      serviceChar(first, "checkout", "coupling").score,
    );
    expect(serviceChar(second, "checkout", "duplication").score).toBeGreaterThanOrEqual(
      serviceChar(first, "checkout", "duplication").score,
    );
  });

  it("scores internal clones on the service and cross-service clones on the platform", () => {
    const payload: AnalysisPayload = {
      ...zeroFindings,
      services: ["checkout", "notification"],
      duplication: {
        percentage: 4.2,
        clones: [
          {
            files: [
              "services/checkout/src/domain/order.ts",
              "services/checkout/src/domain/order-copy.ts",
            ],
            lines: 12,
            tokens: 80,
            classification: "internal",
            services: ["checkout"],
          },
          {
            files: [
              "services/checkout/src/domain/send-instruction.ts",
              "services/notification/src/domain/send-instruction.ts",
            ],
            lines: 20,
            tokens: 90,
            classification: "cross-service",
            services: ["checkout", "notification"],
          },
        ],
      },
    };
    const result = score(payload, []);
    expect(serviceChar(result, "checkout", "duplication").score).toBe(92);
    expect(serviceChar(result, "notification", "duplication").score).toBe(100);
    expect(characteristic(result, "cross-service-integrity").score).toBe(90);
  });

  it("suppresses a platform-scoped cross-service clone decision", () => {
    const payload: AnalysisPayload = {
      ...zeroFindings,
      duplication: {
        percentage: 1,
        clones: [
          {
            files: [
              "services/checkout/src/domain/send-instruction.ts",
              "services/notification/src/domain/send-instruction.ts",
            ],
            lines: 20,
            tokens: 90,
          },
        ],
      },
    };
    const decision: AcceptedDecision = {
      id: "decision-cross-service-send-instruction",
      ruleId: "duplication-cross-service",
      pathGlob: "**/send-instruction.ts",
      decision: "accept",
      rationale: "each service renders its own email",
      decidedBy: "test",
      decidedAt: "2026-01-01T00:00:00.000Z",
      active: true,
      scope: "platform",
    };
    const result = score(payload, [decision]);
    expect(characteristic(result, "cross-service-integrity").score).toBe(100);
    expect(characteristic(result, "cross-service-integrity").suppressedBy).toEqual([
      "decision-cross-service-send-instruction",
    ]);
  });

  it("drops layering when domain imports transport or infrastructure", () => {
    const payload: AnalysisPayload = {
      ...zeroFindings,
      services: ["checkout", "notification"],
      archTests: [
        {
          ruleId: "rule-6",
          passed: false,
          violations: [
            {
              file: "services/checkout/src/domain/mark-paid.ts",
              detail: "depends on transport",
              service: "checkout",
            },
          ],
        },
        {
          ruleId: "rule-8",
          passed: false,
          violations: [
            {
              file: "services/checkout/src/domain/mark-paid.ts",
              detail: "depends on infrastructure",
              service: "checkout",
            },
          ],
        },
        {
          ruleId: "rule-9",
          passed: false,
          violations: [
            {
              file: "services/checkout/src/infrastructure/order-store.ts",
              detail: "depends on transport",
              service: "checkout",
            },
          ],
        },
      ],
    };
    const result = score(payload, []);
    expect(serviceChar(result, "checkout", "layering").score).toBe(40);
    expect(characteristic(result, "layering").score).toBe(70);
    expect(characteristic(result, "cross-service-integrity").score).toBe(100);
  });

  it("drops checkout boundary and platform CSI when transport imports another service", () => {
    const payload: AnalysisPayload = {
      ...zeroFindings,
      services: ["checkout", "notification"],
      archTests: [
        {
          ruleId: "rule-7",
          passed: false,
          violations: [
            {
              file: "services/checkout/src/transport/http.ts",
              detail: "depends on notification transport",
              service: "checkout",
            },
          ],
        },
      ],
    };
    const result = score(payload, []);
    expect(serviceChar(result, "checkout", "boundary-integrity").score).toBe(75);
    expect(serviceChar(result, "notification", "boundary-integrity").score).toBe(
      100,
    );
    expect(characteristic(result, "cross-service-integrity").score).toBe(75);
  });
});

describe("classifyClone", () => {
  it("labels a self-clone internal", () => {
    expect(
      classifyClone([
        "services/checkout/src/a.ts",
        "services/checkout/src/b.ts",
      ]),
    ).toEqual({ classification: "internal", services: ["checkout"] });
  });

  it("labels a clone spanning two services as cross-service", () => {
    expect(
      classifyClone([
        "services/checkout/src/domain/send-instruction.ts",
        "services/notification/src/domain/send-instruction.ts",
      ]),
    ).toEqual({
      classification: "cross-service",
      services: ["checkout", "notification"],
    });
  });

  it("labels a clone that leaves services/ as shared", () => {
    expect(
      classifyClone([
        "services/checkout/src/app.ts",
        "health/scoring/src/cli.ts",
      ]),
    ).toEqual({ classification: "shared", services: ["checkout"] });
  });
});
