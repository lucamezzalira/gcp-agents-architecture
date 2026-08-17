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

export function slimRunForClient(run: HealthRun, keepDetail: boolean): HealthRun {
  if (keepDetail) {
    return run;
  }
  const strip = (item: HealthRun["characteristics"][number]) => ({
    id: item.id,
    score: item.score,
    reasoning: "",
    recommendations: [] as string[],
    signalsUsed: [] as string[],
    ...(item.suppressedBy !== undefined
      ? { suppressedBy: item.suppressedBy }
      : {}),
  });
  return {
    ...run,
    characteristics: run.characteristics.map(strip),
    services: run.services.map((service) => ({
      ...service,
      characteristics: service.characteristics.map(strip),
    })),
  };
}

export function clientRunsPayload(
  runs: HealthRun[],
  selectedId?: string,
): HealthRun[] {
  return runs.map((run) => slimRunForClient(run, run.runId === selectedId));
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

export const SERVICE_SPREAD_THRESHOLD = 80;

export type WorstService = {
  service: string;
  overall: number;
};

export function worstService(run: HealthRun): WorstService | undefined {
  if (run.services.length === 0) {
    return undefined;
  }
  const ranked = [...run.services].sort((left, right) => {
    if (left.overall !== right.overall) {
      return left.overall - right.overall;
    }
    return left.service.localeCompare(right.service);
  });
  const found = ranked[0];
  if (found === undefined) {
    return undefined;
  }
  return { service: found.service, overall: found.overall };
}

export function servicesBelowThreshold(
  run: HealthRun,
  threshold = SERVICE_SPREAD_THRESHOLD,
): number {
  return run.services.filter((item) => item.overall < threshold).length;
}

export function platformRollupLine(): string {
  return "Weighted mean of five characteristics. Boundary, layering, coupling and duplication are means across services. Cross-service-integrity is the platform boundary channel.";
}

export function platformSpreadLine(run: HealthRun): string {
  const worst = worstService(run);
  const below = servicesBelowThreshold(run);
  const total = run.services.length;
  if (worst === undefined) {
    return `${below} of ${total} below ${SERVICE_SPREAD_THRESHOLD}`;
  }
  return `Worst ${worst.service} ${worst.overall} · ${below} of ${total} below ${SERVICE_SPREAD_THRESHOLD}`;
}

export function trendScores(
  runs: HealthRun[],
  service?: string,
): number[] {
  return runs.map((run) => displayedOverall(run, service));
}

export const TREND_CHART = {
  width: 640,
  height: 180,
  baselineY: 168,
} as const;

export function trendArea(
  points: ChartPoint[],
  baselineY = TREND_CHART.baselineY,
): string {
  if (points.length === 0) {
    return "";
  }
  const line = polyline(points);
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) {
    return "";
  }
  return `${first.x},${baselineY} ${line} ${last.x},${baselineY}`;
}

export function trendHeading(service?: string): string {
  return service === undefined
    ? "Trend across commits"
    : `Trend across commits · ${service}`;
}

export function trendCaption(service?: string): string {
  const scope = service === undefined ? "Platform overall" : `${service} overall`;
  return `${scope}. Vertical marks are rule-set version changes. Scores on either side are not directly comparable. Default list is current runs only.`;
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

export function platformGapLine(run: HealthRun, service?: string): string {
  if (service !== undefined) {
    return "";
  }
  return displayedCharacteristics(run)
    .filter((item) => item.score < 100)
    .map((item) => `${displayName(item.id)} ${item.score}`)
    .join(" · ");
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

export function shaTail(sha: string, length = 10): string {
  if (sha.length <= length) {
    return sha;
  }
  return sha.slice(-length);
}

export function commitUrl(sha: string): string {
  return `https://github.com/lucamezzalira/gcp-agents-architecture/commit/${sha}`;
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

export function formatReadAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function displayedState(run: HealthRun): string {
  if (run.incomplete === true && run.state !== "superseded") {
    return "incomplete";
  }
  return run.state ?? "current";
}

export function legendScoreLine(run: HealthRun, service?: string): string {
  const score = displayedOverall(run, service);
  const superseded = run.state === "superseded" ? " · superseded" : "";
  const incomplete =
    run.incomplete === true && run.state !== "superseded" ? " · incomplete" : "";
  return `${shortSha(run.commitSha)} · ${score}${superseded}${incomplete} · v${ruleSetVersionOf(run)}`;
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

