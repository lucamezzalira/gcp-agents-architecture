import { z } from "zod";
import {
  databaseUrl,
  postgresTarget,
  withSqlRetry,
  type Sql,
} from "@health/postgres";
import {
  CHARACTERISTIC_ORDER,
  type CharacteristicRead,
  type HealthRun,
  type HealthStore,
  type ObservedRuntimeEdge,
  type ServiceRead,
} from "./types.js";

export { databaseUrl, postgresTarget };
export type { PostgresTarget } from "@health/postgres";

const runRowSchema = z.object({
  run_id: z.string(),
  commit_sha: z.string(),
  commit_message: z.string().nullable(),
  created_at: z.union([z.string(), z.date()]),
  overall_score: z.coerce.number(),
  reasoner: z.string().nullable().optional(),
  trace_id: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  host: z.string().nullable().optional(),
  agent_identity: z.string().nullable().optional(),
  rule_set_version: z.coerce.number().nullable().optional(),
  state: z.string().nullable().optional(),
  incomplete: z.boolean().nullable().optional(),
  superseded_at: z.union([z.string(), z.date()]).nullable().optional(),
  superseded_by: z.string().nullable().optional(),
  service_overalls: z.unknown().optional(),
  runtime_edges: z.unknown().optional(),
});

const scoreRowSchema = z.object({
  run_id: z.string(),
  scope: z.string().nullable().optional(),
  characteristic: z.string(),
  score: z.coerce.number(),
  suppressed_by: z.unknown().optional(),
});

const characteristicRowSchema = scoreRowSchema.extend({
  reasoning: z.string().nullable().optional(),
  recommendations: z.unknown().optional(),
  signals_used: z.unknown().optional(),
});

function asIso(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString();
}

function asStringArray(value: unknown): string[] {
  const parsed = z.array(z.string()).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function asRuntimeEdges(value: unknown): ObservedRuntimeEdge[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "object" &&
        value !== null &&
        "runtimeEdges" in value
      ? (value as { runtimeEdges?: unknown }).runtimeEdges
      : undefined;
  const parsed = z
    .array(
      z.object({
        from: z.string().optional(),
        from_service: z.string().optional(),
        to: z.string(),
        protocol: z.string(),
        count: z.number().optional(),
      }),
    )
    .safeParse(raw);
  if (!parsed.success) {
    return [];
  }
  const edges: ObservedRuntimeEdge[] = [];
  for (const item of parsed.data) {
    const from = item.from ?? item.from_service;
    if (from === undefined) {
      continue;
    }
    edges.push({
      from,
      to: item.to,
      protocol: item.protocol,
      count: item.count,
    });
  }
  return edges;
}

function asOveralls(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "number") {
      result[key] = item;
    }
  }
  return result;
}

function sortCharacteristics(
  items: CharacteristicRead[],
): CharacteristicRead[] {
  const rank = new Map(
    CHARACTERISTIC_ORDER.map((id, index) => [id, index] as const),
  );
  return [...items].sort((left, right) => {
    const leftRank =
      rank.get(left.id as (typeof CHARACTERISTIC_ORDER)[number]) ?? 99;
    const rightRank =
      rank.get(right.id as (typeof CHARACTERISTIC_ORDER)[number]) ?? 99;
    return leftRank - rightRank;
  });
}

function toCharacteristic(row: {
  characteristic: string;
  score: number;
  reasoning?: string | null;
  recommendations?: unknown;
  signals_used?: unknown;
  suppressed_by?: unknown;
}): CharacteristicRead {
  const suppressedBy = asStringArray(row.suppressed_by);
  const characteristic: CharacteristicRead = {
    id: row.characteristic,
    score: row.score,
    reasoning: row.reasoning ?? "",
    recommendations: asStringArray(row.recommendations),
    signalsUsed: asStringArray(row.signals_used),
  };
  if (suppressedBy.length > 0) {
    characteristic.suppressedBy = suppressedBy;
  }
  return characteristic;
}

function attachCharacteristics(
  runs: z.infer<typeof runRowSchema>[],
  charRows: Array<{
    run_id: string;
    scope?: string | null;
    characteristic: string;
    score: number;
    reasoning?: string | null;
    recommendations?: unknown;
    signals_used?: unknown;
    suppressed_by?: unknown;
  }>,
): HealthRun[] {
  const platform = new Map<string, CharacteristicRead[]>();
  const byService = new Map<string, Map<string, CharacteristicRead[]>>();
  for (const row of charRows) {
    const characteristic = toCharacteristic(row);
    const scope = row.scope ?? "platform";
    if (scope === "platform") {
      const list = platform.get(row.run_id) ?? [];
      list.push(characteristic);
      platform.set(row.run_id, list);
      continue;
    }
    const services = byService.get(row.run_id) ?? new Map();
    const list = services.get(scope) ?? [];
    list.push(characteristic);
    services.set(scope, list);
    byService.set(row.run_id, services);
  }
  return runs.map((run) => {
    const overalls = asOveralls(run.service_overalls);
    const serviceChars = byService.get(run.run_id) ?? new Map();
    const services: ServiceRead[] = [...serviceChars.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, characteristics]) => ({
        service: name,
        overall: overalls[name] ?? 0,
        characteristics: sortCharacteristics(characteristics),
      }));
    const runtimeEdges = asRuntimeEdges(run.runtime_edges);
    return {
      runId: run.run_id,
      commitSha: run.commit_sha,
      commitMessage: run.commit_message ?? "",
      createdAt: asIso(run.created_at),
      overall: run.overall_score,
      reasoner: run.reasoner ?? undefined,
      traceId: run.trace_id ?? undefined,
      model: run.model ?? undefined,
      host: run.host ?? undefined,
      agentIdentity: run.agent_identity ?? undefined,
      ruleSetVersion: run.rule_set_version ?? 1,
      state: run.state ?? "current",
      incomplete: run.incomplete === true,
      supersededAt:
        run.superseded_at === null || run.superseded_at === undefined
          ? undefined
          : asIso(run.superseded_at),
      supersededBy: run.superseded_by ?? undefined,
      characteristics: sortCharacteristics(platform.get(run.run_id) ?? []),
      services,
      runtimeEdges: runtimeEdges.length > 0 ? runtimeEdges : undefined,
    };
  });
}

async function queryRuns(
  sql: Sql,
  includeSuperseded: boolean,
): Promise<{ rows: z.infer<typeof runRowSchema>[]; runs: HealthRun[] }> {
  const runRows = includeSuperseded
    ? await sql`
        select run_id, commit_sha, commit_message, created_at, overall_score,
               reasoner, trace_id, model, host, agent_identity, rule_set_version,
               state, incomplete, superseded_at,
               superseded_by, service_overalls,
               metrics->'runtimeEdges' as runtime_edges
        from health_run
        order by coalesce(committed_at, created_at) asc, created_at asc
      `
    : await sql`
        select run_id, commit_sha, commit_message, created_at, overall_score,
               reasoner, trace_id, model, host, agent_identity, rule_set_version,
               state, incomplete, superseded_at,
               superseded_by, service_overalls,
               metrics->'runtimeEdges' as runtime_edges
        from health_run
        where coalesce(state, 'current') = 'current'
        order by coalesce(committed_at, created_at) asc, created_at asc
      `;
  const rows = z.array(runRowSchema).parse(runRows);
  if (rows.length === 0) {
    return { rows, runs: [] };
  }
  const charRows = await sql`
    select run_id, coalesce(scope, 'platform') as scope, characteristic, score,
           suppressed_by
    from health_characteristic
    where run_id in ${sql(rows.map((run) => run.run_id))}
  `;
  return {
    rows,
    runs: attachCharacteristics(rows, z.array(scoreRowSchema).parse(charRows)),
  };
}

function pickDetailRun(
  runs: HealthRun[],
  detailRunId?: string,
): HealthRun | undefined {
  if (detailRunId !== undefined && detailRunId.length > 0) {
    const exact = runs.find((run) => run.runId === detailRunId);
    if (exact !== undefined) {
      return exact;
    }
    const bySha = [...runs]
      .reverse()
      .find(
        (run) =>
          run.commitSha === detailRunId ||
          run.commitSha.startsWith(detailRunId),
      );
    if (bySha !== undefined) {
      return bySha;
    }
  }
  return runs.at(-1);
}

async function hydrateDetail(
  sql: Sql,
  rows: z.infer<typeof runRowSchema>[],
  runs: HealthRun[],
  detailRunId?: string,
): Promise<HealthRun[]> {
  const target = pickDetailRun(runs, detailRunId);
  if (target === undefined) {
    return runs;
  }
  const charRows = await sql`
    select run_id, coalesce(scope, 'platform') as scope, characteristic, score,
           reasoning, recommendations, signals_used, suppressed_by
    from health_characteristic
    where run_id = ${target.runId}
  `;
  const detailed = attachCharacteristics(
    rows.filter((row) => row.run_id === target.runId),
    z.array(characteristicRowSchema).parse(charRows),
  )[0];
  if (detailed === undefined) {
    return runs;
  }
  return runs.map((run) => (run.runId === detailed.runId ? detailed : run));
}

export function createPostgresStore(url = databaseUrl()): HealthStore {
  return {
    async loadRuns(options?: {
      includeSuperseded?: boolean;
      detailRunId?: string;
    }): Promise<HealthRun[]> {
      const includeSuperseded = options?.includeSuperseded === true;
      return withSqlRetry(url, async (sql) => {
        const { rows, runs } = await queryRuns(sql, includeSuperseded);
        return hydrateDetail(sql, rows, runs, options?.detailRunId);
      });
    },
  };
}
