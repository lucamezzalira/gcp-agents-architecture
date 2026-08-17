import { pathMatchesGlob, signalTouchesPath } from "./path-match.js";
import {
  CHARACTERISTICS,
  type CharacteristicRead,
  type HealthRunSummary,
  type HealthStore,
  type LatestHealth,
} from "./types.js";

export type HealthToolResult = {
  path: string | undefined;
  scope: "path" | "system";
  service?: string;
  runId: string;
  commitSha: string;
  commitMessage: string;
  createdAt: string;
  overall: number;
  reasoner?: string;
  traceId?: string;
  model?: string;
  host?: string;
  agentIdentity?: string;
  ruleSetVersion?: number;
  incomplete?: boolean;
  characteristics: CharacteristicRead[];
};

export type GetHealthOptions = {
  path?: string;
  commitSha?: string;
};

export function serviceNameFromPath(path: string): string | undefined {
  const normalised = path.replace(/\\/g, "/");
  const match = normalised.match(/(?:^|\/)services\/([^/]+)/);
  return match?.[1];
}

export async function getHealth(
  store: HealthStore,
  pathOrOptions?: string | GetHealthOptions,
): Promise<HealthToolResult | { error: string }> {
  const options =
    typeof pathOrOptions === "string" || pathOrOptions === undefined
      ? { path: pathOrOptions }
      : pathOrOptions;
  const run = await loadRun(store, options.commitSha);
  if (run === undefined) {
    if (options.commitSha !== undefined && options.commitSha.length > 0) {
      return { error: `no health run for commit ${options.commitSha}` };
    }
    return { error: "no health runs in postgres" };
  }
  const path = options.path;
  if (path === undefined || path.length === 0) {
    return toResult(run, undefined, "system", run.characteristics, run.overall);
  }
  const serviceName = serviceNameFromPath(path);
  const service =
    serviceName === undefined
      ? undefined
      : run.services.find((item) => item.service === serviceName);
  if (service !== undefined) {
    return {
      ...toResult(run, path, "path", service.characteristics, service.overall),
      service: service.service,
    };
  }
  const matched = run.characteristics.filter((item) =>
    item.signalsUsed.some((signal) => signalTouchesPath(signal, path)),
  );
  if (matched.length === 0) {
    return toResult(run, path, "system", run.characteristics, run.overall);
  }
  return toResult(run, path, "path", matched, run.overall);
}

export async function listHealthRuns(
  store: HealthStore,
): Promise<HealthRunSummary[]> {
  const runs = await store.loadRuns();
  return runs.map((run) => ({
    runId: run.runId,
    commitSha: run.commitSha,
    commitMessage: run.commitMessage,
    createdAt: run.createdAt,
    overall: run.overall,
    reasoner: run.reasoner,
    traceId: run.traceId,
    model: run.model,
    host: run.host,
    agentIdentity: run.agentIdentity,
    ruleSetVersion: run.ruleSetVersion,
    state: run.state,
    incomplete: run.incomplete,
    characteristics: run.characteristics.map((item) => ({
      id: item.id,
      score: item.score,
    })),
    services: run.services.map((item) => ({
      service: item.service,
      overall: item.overall,
    })),
  }));
}

export async function getPriorDecisions(store: HealthStore, path: string) {
  const decisions = await store.loadActiveDecisions();
  return decisions.filter(
    (item) => item.active && pathMatchesGlob(path, item.pathGlob),
  );
}

export function listCharacteristics() {
  return CHARACTERISTICS.map((item) => ({ ...item }));
}

async function loadRun(
  store: HealthStore,
  commitSha?: string,
): Promise<LatestHealth | undefined> {
  if (commitSha === undefined || commitSha.length === 0) {
    return store.loadLatest();
  }
  const runs = await store.loadRuns();
  const matches = runs.filter(
    (run) => run.commitSha.startsWith(commitSha) || run.runId.startsWith(commitSha),
  );
  const found = matches.at(-1);
  if (found === undefined) {
    return undefined;
  }
  return (await store.loadDetailed(found.runId)) ?? found;
}

function toResult(
  latest: LatestHealth,
  path: string | undefined,
  scope: "path" | "system",
  characteristics: CharacteristicRead[],
  overall: number,
): HealthToolResult {
  return {
    path,
    scope,
    runId: latest.runId,
    commitSha: latest.commitSha,
    commitMessage: latest.commitMessage,
    createdAt: latest.createdAt,
    overall,
    reasoner: latest.reasoner,
    traceId: latest.traceId,
    model: latest.model,
    host: latest.host,
    agentIdentity: latest.agentIdentity,
    ruleSetVersion: latest.ruleSetVersion,
    incomplete: latest.incomplete,
    characteristics,
  };
}
