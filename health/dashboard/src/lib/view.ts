import type { HealthRun } from "./types.js";

export type DashboardModel = {
  runs: HealthRun[];
  selected: HealthRun | undefined;
};

export function buildDashboardModel(
  runs: HealthRun[],
  selectedSha?: string,
): DashboardModel {
  return {
    runs,
    selected: selectRun(runs, selectedSha),
  };
}

export function selectRun(
  runs: HealthRun[],
  sha?: string,
): HealthRun | undefined {
  if (runs.length === 0) {
    return undefined;
  }
  if (sha !== undefined && sha.length > 0) {
    const match = runs.find(
      (run) => run.commitSha === sha || run.commitSha.startsWith(sha) || run.runId === sha,
    );
    if (match !== undefined) {
      return match;
    }
  }
  return runs[runs.length - 1];
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

