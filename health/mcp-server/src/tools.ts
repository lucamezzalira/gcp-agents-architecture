import { pathMatchesGlob, signalTouchesPath } from "./path-match.js";
import {
  CHARACTERISTICS,
  type CharacteristicRead,
  type HealthStore,
  type LatestHealth,
} from "./types.js";

export type HealthToolResult = {
  path: string | undefined;
  scope: "path" | "system";
  runId: string;
  commitSha: string;
  commitMessage: string;
  overall: number;
  characteristics: CharacteristicRead[];
};

export async function getHealth(
  store: HealthStore,
  path?: string,
): Promise<HealthToolResult | { error: string }> {
  const latest = await store.loadLatest();
  if (latest === undefined) {
    return { error: "no health runs in postgres" };
  }
  if (path === undefined || path.length === 0) {
    return toResult(latest, undefined, "system", latest.characteristics);
  }
  const matched = latest.characteristics.filter((item) =>
    item.signalsUsed.some((signal) => signalTouchesPath(signal, path)),
  );
  if (matched.length === 0) {
    return toResult(latest, path, "system", latest.characteristics);
  }
  return toResult(latest, path, "path", matched);
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

function toResult(
  latest: LatestHealth,
  path: string | undefined,
  scope: "path" | "system",
  characteristics: CharacteristicRead[],
): HealthToolResult {
  return {
    path,
    scope,
    runId: latest.runId,
    commitSha: latest.commitSha,
    commitMessage: latest.commitMessage,
    overall: latest.overall,
    characteristics,
  };
}
