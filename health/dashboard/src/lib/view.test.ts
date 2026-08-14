import { describe, expect, it } from "vitest";
import {
  buildDashboardModel,
  commitUrl,
  easeOutCubic,
  hundredNote,
  improvementCopy,
  lerp,
  polyline,
  ruleSetMarkers,
  scoreTone,
  selectRun,
  shaTail,
  shortSha,
  toneColor,
  trendCaption,
  trendHeading,
  trendPoints,
  trendScores,
  worstService,
  servicesBelowThreshold,
  displayedCharacteristics,
  platformGapLine,
  platformSpreadLine,
  SERVICE_SPREAD_THRESHOLD,
  clientRunsPayload,
} from "./view.js";
import type { HealthRun } from "./types.js";

const restore: HealthRun = {
  runId: "611fc24ee716690b4b0aae02eb5ea32e3f49a691",
  commitSha: "611fc24ee716690b4b0aae02eb5ea32e3f49a691",
  commitMessage: "Restore: checkout notifies only through the send instruction.",
  createdAt: "2026-08-13T12:00:00.000Z",
  overall: 100,
  characteristics: [
    {
      id: "boundary-integrity",
      score: 100,
      reasoning: "boundaries hold",
      recommendations: [],
      signalsUsed: [],
    },
  ],
  services: [],
};

const regression: HealthRun = {
  runId: "edfd7d795e29fe4a1d6893ba1c3f1f660f56d603",
  commitSha: "edfd7d795e29fe4a1d6893ba1c3f1f660f56d603",
  commitMessage: "Regression: checkout imports the email provider",
  createdAt: "2026-08-13T11:00:00.000Z",
  overall: 74,
  characteristics: [
    {
      id: "boundary-integrity",
      score: 35,
      reasoning: "checkout imported the email provider",
      recommendations: ["Keep provider access inside services/notification."],
      signalsUsed: ["ts-arch:rule-3:services/checkout/src/domain/mark-paid.ts"],
    },
  ],
  services: [],
};

const baseline: HealthRun = {
  ...restore,
  runId: "14d3b0733b993f46dc05a2165df3bc681bbe3f6d",
  commitSha: "14d3b0733b993f46dc05a2165df3bc681bbe3f6d",
  commitMessage: "Baseline",
  createdAt: "2026-08-13T10:00:00.000Z",
};

const runs = [baseline, regression, restore];

describe("buildDashboardModel", () => {
  it("defaults to the last run", () => {
    const model = buildDashboardModel(runs);
    expect(model.selected?.commitSha).toBe(restore.commitSha);
    expect(model.runs).toHaveLength(3);
  });

  it("selects a historical commit by sha prefix", () => {
    expect(selectRun(runs, "edfd7d7")?.overall).toBe(74);
    expect(selectRun(runs, "edfd7d7")?.characteristics[0]?.recommendations[0]).toContain(
      "notification",
    );
  });

  it("bands scores green, orange, then red", () => {
    expect(shortSha(restore.commitSha)).toBe("611fc24");
    expect(shaTail(restore.commitSha)).toBe("2e3f49a691");
    expect(commitUrl(restore.commitSha)).toBe(
      "https://github.com/lucamezzalira/gcp-agents-architecture/commit/611fc24ee716690b4b0aae02eb5ea32e3f49a691",
    );
    expect(scoreTone(100)).toBe("ok");
    expect(scoreTone(85)).toBe("ok");
    expect(scoreTone(84)).toBe("mid");
    expect(scoreTone(55)).toBe("mid");
    expect(scoreTone(54)).toBe("drop");
    expect(toneColor(100)).toBe("#4ade80");
    expect(toneColor(74)).toBe("#fb923c");
    expect(toneColor(35)).toBe("#f43f5e");
  });

  it("plots the trend dip", () => {
    const points = trendPoints([100, 74, 100], 200, 80);
    expect(points).toHaveLength(3);
    expect(points[1]?.y).toBeGreaterThan(points[0]?.y ?? 0);
    expect(polyline(points).split(" ")).toHaveLength(3);
  });

  it("surfaces recommendations only when the score can improve", () => {
    expect(improvementCopy(100, ["ignore me"])).toEqual([]);
    expect(
      improvementCopy(35, ["Keep provider access inside services/notification."]),
    ).toEqual(["Keep provider access inside services/notification."]);
    expect(improvementCopy(60, [])).toEqual([
      "Inspect the signals on this characteristic and remove the findings.",
    ]);
  });

  it("eases a score from 100 toward 74", () => {
    expect(lerp(100, 74, 0)).toBe(100);
    expect(lerp(100, 74, 1)).toBe(74);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it("marks the trend where the rule set version changes", () => {
    const versioned = [
      { ...baseline, ruleSetVersion: 1 },
      { ...regression, ruleSetVersion: 1 },
      { ...restore, ruleSetVersion: 2 },
    ];
    const points = trendPoints([100, 74, 100], 200, 80);
    expect(ruleSetMarkers(versioned, points)).toEqual([
      { x: points[2]?.x, version: 2 },
    ]);
  });

  it("distinguishes a clean 100 from a suppressed 100", () => {
    expect(hundredNote({ score: 100 })).toBe("At 100. No changes needed.");
    expect(
      hundredNote({ score: 100, suppressedBy: ["decision-dup"] }),
    ).toBe("At 100 because accepted decisions suppress findings.");
    expect(hundredNote({ score: 74, suppressedBy: ["decision-dup"] })).toBeUndefined();
  });

  it("plots the selected service overall on the trend, and the platform when none is selected", () => {
    const scoped: HealthRun[] = [
      {
        ...baseline,
        overall: 100,
        services: [
          { service: "checkout", overall: 100, characteristics: [] },
          { service: "notification", overall: 100, characteristics: [] },
        ],
      },
      {
        ...regression,
        overall: 61,
        services: [
          { service: "checkout", overall: 70, characteristics: [] },
          { service: "notification", overall: 100, characteristics: [] },
        ],
      },
      {
        ...restore,
        overall: 100,
        services: [
          { service: "checkout", overall: 100, characteristics: [] },
          { service: "notification", overall: 100, characteristics: [] },
        ],
      },
    ];
    expect(trendScores(scoped)).toEqual([100, 61, 100]);
    expect(trendScores(scoped, "checkout")).toEqual([100, 70, 100]);
    expect(trendScores(scoped, "notification")).toEqual([100, 100, 100]);
    expect(trendHeading("checkout")).toContain("checkout");
    expect(trendHeading()).toBe("Trend across commits");
    expect(trendCaption("checkout")).toMatch(/^checkout overall/);
    expect(trendCaption()).toMatch(/^Platform overall/);
  });

  it("names the worst service and counts those below 80", () => {
    const run: HealthRun = {
      ...restore,
      overall: 76,
      services: [
        { service: "checkout", overall: 70, characteristics: [] },
        { service: "notification", overall: 100, characteristics: [] },
      ],
    };
    expect(worstService(run)).toEqual({ service: "checkout", overall: 70 });
    expect(servicesBelowThreshold(run)).toBe(1);
    expect(SERVICE_SPREAD_THRESHOLD).toBe(80);
    expect(platformSpreadLine(run)).toBe("Worst checkout 70 · 1 of 2 below 80");
  });

  it("names platform characteristics below 100 next to the ring", () => {
    const characteristic = (
      id: string,
      score: number,
    ): HealthRun["characteristics"][number] => ({
      id,
      score,
      reasoning: "",
      recommendations: [],
      signalsUsed: [],
    });
    const run: HealthRun = {
      ...restore,
      overall: 98,
      characteristics: [
        characteristic("boundary-integrity", 100),
        characteristic("layering", 100),
        characteristic("coupling", 100),
        characteristic("duplication", 100),
        characteristic("cross-service-integrity", 90),
      ],
      services: [
        { service: "checkout", overall: 100, characteristics: [] },
        { service: "notification", overall: 100, characteristics: [] },
      ],
    };
    expect(displayedCharacteristics(run).map((item) => item.id)).toContain(
      "cross-service-integrity",
    );
    expect(platformGapLine(run)).toBe("cross service integrity 90");
    expect(platformSpreadLine(run)).toBe("Worst checkout 100 · 0 of 2 below 80");
    expect(platformGapLine(run, "checkout")).toBe("");
    expect(
      platformGapLine({
        ...run,
        overall: 100,
        characteristics: run.characteristics.map((item) => ({
          ...item,
          score: 100,
        })),
      }),
    ).toBe("");
    expect(
      platformGapLine({
        ...run,
        characteristics: [
          characteristic("boundary-integrity", 80),
          characteristic("layering", 100),
          characteristic("coupling", 100),
          characteristic("duplication", 100),
          characteristic("cross-service-integrity", 90),
        ],
      }),
    ).toBe("boundary integrity 80 · cross service integrity 90");
  });
});

describe("clientRunsPayload", () => {
  it("keeps reasoning only on the selected run", () => {
    const payload = clientRunsPayload(runs, restore.runId);
    expect(payload[2]?.characteristics[0]?.reasoning).toBe("boundaries hold");
    expect(payload[1]?.characteristics[0]?.reasoning).toBe("");
    expect(payload[1]?.characteristics[0]?.recommendations).toEqual([]);
  });
});
