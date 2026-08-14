import type { HealthRun } from "./types.js";

export type DashboardModel = {
  runs: HealthRun[];
  selected: HealthRun | undefined;
  service: string | undefined;
};

export function buildDashboardModel(
  runs: HealthRun[],
  selectedSha?: string,
  selectedRunId?: string,
  service?: string,
): DashboardModel {
  const selected = selectRun(runs, selectedSha, selectedRunId);
  const serviceName =
    service !== undefined &&
    service.length > 0 &&
    selected?.services.some((item) => item.service === service)
      ? service
      : undefined;
  return {
    runs,
    selected,
    service: serviceName,
  };
}

export function selectRun(
  runs: HealthRun[],
  sha?: string,
  runId?: string,
): HealthRun | undefined {
  if (runs.length === 0) {
    return undefined;
  }
  if (runId !== undefined && runId.length > 0) {
    const exact = runs.find((run) => run.runId === runId);
    if (exact !== undefined) {
      return exact;
    }
  }
  if (sha !== undefined && sha.length > 0) {
    const match = [...runs].reverse().find(
      (run) =>
        run.commitSha === sha ||
        run.commitSha.startsWith(sha) ||
        run.runId === sha,
    );
    if (match !== undefined) {
      return match;
    }
  }
  return runs[runs.length - 1];
}

export function displayedOverall(
  run: HealthRun,
  service?: string,
): number {
  if (service === undefined) {
    return run.overall;
  }
  return (
    run.services.find((item) => item.service === service)?.overall ?? run.overall
  );
}

export function displayedCharacteristics(
  run: HealthRun,
  service?: string,
): HealthRun["characteristics"] {
  if (service === undefined) {
    return run.characteristics;
  }
  return (
    run.services.find((item) => item.service === service)?.characteristics ??
    run.characteristics
  );
}

export function hundredNote(item: {
  score: number;
  suppressedBy?: string[];
}): string | undefined {
  if (item.score !== 100) {
    return undefined;
  }
  if ((item.suppressedBy ?? []).length > 0) {
    return "At 100 because accepted decisions suppress findings.";
  }
  return "At 100. No changes needed.";
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export type ScoreTone = "ok" | "mid" | "drop";

export const TONE_COLORS: Record<ScoreTone, string> = {
  ok: "#4ade80",
  mid: "#fb923c",
  drop: "#f43f5e",
};

export function scoreTone(score: number): ScoreTone {
  if (score >= 85) {
    return "ok";
  }
  if (score >= 55) {
    return "mid";
  }
  return "drop";
}

export function toneColor(score: number): string {
  return TONE_COLORS[scoreTone(score)];
}

export function displayName(id: string): string {
  return id.replaceAll("-", " ");
}

export function improvementCopy(score: number, recommendations: string[]): string[] {
  if (score === 100) {
    return [];
  }
  if (recommendations.length > 0) {
    return recommendations;
  }
  return ["Inspect the signals on this characteristic and remove the findings."];
}

export type ChartPoint = {
  x: number;
  y: number;
  score: number;
};

export function ruleSetVersionOf(run: HealthRun): number {
  return run.ruleSetVersion ?? 1;
}

export type RuleSetMarker = {
  x: number;
  version: number;
};

export function ruleSetMarkers(
  runs: HealthRun[],
  points: ChartPoint[],
): RuleSetMarker[] {
  const markers: RuleSetMarker[] = [];
  for (let index = 1; index < runs.length; index += 1) {
    const previous = runs[index - 1];
    const current = runs[index];
    const point = points[index];
    if (
      previous === undefined ||
      current === undefined ||
      point === undefined
    ) {
      continue;
    }
    if (ruleSetVersionOf(previous) !== ruleSetVersionOf(current)) {
      markers.push({ x: point.x, version: ruleSetVersionOf(current) });
    }
  }
  return markers;
}

export function trendPoints(
  scores: number[],
  width: number,
  height: number,
  pad = 12,
): ChartPoint[] {
  if (scores.length === 0) {
    return [];
  }
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  return scores.map((score, index) => {
    const x =
      scores.length === 1
        ? width / 2
        : pad + (index / (scores.length - 1)) * innerW;
    const y = pad + innerH - (score / 100) * innerH;
    return { x, y, score };
  });
}

export function polyline(points: ChartPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

export function ringOffset(score: number, radius: number): number {
  const circumference = 2 * Math.PI * radius;
  return circumference * (1 - Math.min(100, Math.max(0, score)) / 100);
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

