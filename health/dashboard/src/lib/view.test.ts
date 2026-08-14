import { describe, expect, it } from "vitest";
import {
  buildDashboardModel,
  easeOutCubic,
  hundredNote,
  improvementCopy,
  lerp,
  polyline,
  ruleSetMarkers,
  scoreTone,
  selectRun,
  shortSha,
  toneColor,
  trendPoints,
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
});
