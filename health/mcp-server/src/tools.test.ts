import { describe, expect, it } from "vitest";
import { InMemoryHealthStore } from "./memory-store.js";
import {
  getHealth,
  getPriorDecisions,
  listCharacteristics,
  listHealthRuns,
} from "./tools.js";
import type { LatestHealth } from "./types.js";

const latest: LatestHealth = {
  runId: "edfd7d795e29fe4a1d6893ba1c3f1f660f56d603",
  commitSha: "edfd7d795e29fe4a1d6893ba1c3f1f660f56d603",
  commitMessage: "Regression: checkout imports the email provider",
  createdAt: "2026-08-13T12:00:00.000Z",
  overall: 74,
  characteristics: [
    {
      id: "boundary-integrity",
      score: 35,
      reasoning: "checkout imported the email provider",
      recommendations: [
        "Keep provider access inside services/notification.",
      ],
      signalsUsed: [
        "ts-arch:rule-3:services/checkout/src/domain/mark-paid.ts",
      ],
    },
    {
      id: "layering",
      score: 100,
      reasoning: "layering is 100",
      recommendations: [],
      signalsUsed: [],
    },
  ],
};

describe("get_health", () => {
  it("returns latest overall, reasoning and recommendations", async () => {
    const store = new InMemoryHealthStore();
    store.latest = latest;
    const result = await getHealth(store);
    expect(result).toMatchObject({
      overall: 74,
      commitSha: latest.commitSha,
    });
    if ("error" in result) {
      throw new Error("expected a health read");
    }
    const boundary = result.characteristics.find(
      (item) => item.id === "boundary-integrity",
    );
    expect(boundary?.score).toBe(35);
    expect(boundary?.reasoning).toContain("email provider");
    expect(boundary?.recommendations.length).toBeGreaterThan(0);
  });

  it("narrows to characteristics whose signals mention the path", async () => {
    const store = new InMemoryHealthStore();
    store.latest = latest;
    const result = await getHealth(store, "services/checkout");
    if ("error" in result) {
      throw new Error("expected a health read");
    }
    expect(result.scope).toBe("path");
    expect(result.characteristics.map((item) => item.id)).toEqual([
      "boundary-integrity",
    ]);
  });

  it("loads a historical commit when commitSha is set", async () => {
    const store = new InMemoryHealthStore();
    const restored: LatestHealth = {
      ...latest,
      runId: "restored",
      commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      commitMessage: "Restore the notification boundary",
      createdAt: "2026-08-13T13:00:00.000Z",
      overall: 100,
    };
    store.runs = [latest, restored];
    const result = await getHealth(store, { commitSha: "edfd7d79" });
    expect(result).toMatchObject({ overall: 74, commitSha: latest.commitSha });
  });
});

describe("list_health_runs", () => {
  it("returns overall and characteristic scores oldest first", async () => {
    const store = new InMemoryHealthStore();
    store.runs = [
      latest,
      {
        ...latest,
        runId: "restored",
        commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        commitMessage: "Restore the notification boundary",
        createdAt: "2026-08-13T13:00:00.000Z",
        overall: 100,
        characteristics: latest.characteristics.map((item) => ({
          ...item,
          score: 100,
        })),
      },
    ];
    const result = await listHealthRuns(store);
    expect(result.map((item) => item.overall)).toEqual([74, 100]);
    expect(result[0]?.characteristics).toEqual([
      { id: "boundary-integrity", score: 35 },
      { id: "layering", score: 100 },
    ]);
  });
});

describe("get_prior_decisions", () => {
  it("returns only active decisions matching the path", async () => {
    const store = new InMemoryHealthStore();
    store.decisions = [
      {
        id: "keep-dup",
        ruleId: "duplication",
        pathGlob: "services/checkout/**",
        decision: "accept",
        rationale: "each service renders its own email",
        decidedBy: "team",
        decidedAt: "2026-08-01T00:00:00.000Z",
        active: true,
      },
      {
        id: "old",
        ruleId: "rule-3",
        pathGlob: "services/checkout/**",
        decision: "accept",
        rationale: "withdrawn",
        decidedBy: "team",
        decidedAt: "2026-07-01T00:00:00.000Z",
        active: false,
      },
      {
        id: "other-service",
        ruleId: "rule-1",
        pathGlob: "services/notification/**",
        decision: "accept",
        rationale: "not this path",
        decidedBy: "team",
        decidedAt: "2026-08-01T00:00:00.000Z",
        active: true,
      },
    ];
    const result = await getPriorDecisions(
      store,
      "services/checkout/src/domain/render-confirmation.ts",
    );
    expect(result.map((item) => item.id)).toEqual(["keep-dup"]);
  });
});

describe("list_characteristics", () => {
  it("lists the four tracked characteristics", () => {
    expect(listCharacteristics().map((item) => item.id)).toEqual([
      "boundary-integrity",
      "layering",
      "coupling",
      "duplication",
    ]);
  });
});
