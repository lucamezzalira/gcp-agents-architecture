import { z } from "zod";
import {
  databaseUrl,
  postgresTarget,
  withSqlRetry,
  type Sql,
} from "@health/postgres";
import type { CharacteristicRead, HealthStore, LatestHealth, ServiceRead } from "./types.js";
import { acceptedDecisionSchema } from "./schemas.js";

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
  service_overalls: z.unknown().optional(),
});

const characteristicRowSchema = z.object({
  run_id: z.string().optional(),
  scope: z.string().nullable().optional(),
  characteristic: z.string(),
  score: z.coerce.number(),
  reasoning: z.string().nullable().optional(),
  recommendations: z.unknown().optional(),
  signals_used: z.unknown().optional(),
  suppressed_by: z.unknown().optional(),
});

function asIso(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString();
}

function asStringArray(value: unknown): string[] {
  const parsed = z.array(z.string()).safeParse(value);
  if (!parsed.success) {
    return [];
  }
  return parsed.data;
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

function mapRun(
  run: z.infer<typeof runRowSchema>,
  platform: CharacteristicRead[],
  serviceChars: Map<string, CharacteristicRead[]>,
): LatestHealth {
  const overalls = asOveralls(run.service_overalls);
  const services: ServiceRead[] = [...serviceChars.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, characteristics]) => ({
      service: name,
      overall: overalls[name] ?? 0,
      characteristics,
    }));
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
    characteristics: platform,
    services,
  };
}

export function createPostgresStore(url = databaseUrl()): HealthStore {
  const groupChars = (
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
  ) => {
    const platform = new Map<string, CharacteristicRead[]>();
    const byService = new Map<string, Map<string, CharacteristicRead[]>>();
    for (const row of charRows) {
      const characteristic = toCharacteristic({
        characteristic: row.characteristic,
        score: row.score,
        reasoning: row.reasoning ?? null,
        recommendations: row.recommendations,
        signals_used: row.signals_used,
        suppressed_by: row.suppressed_by,
      });
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
    return { platform, byService };
  };

  const load = async (sql: Sql): Promise<LatestHealth[]> => {
    const runRows = await sql`
      select run_id, commit_sha, commit_message, created_at, overall_score,
             reasoner, trace_id, model, host, agent_identity, rule_set_version,
             state, incomplete, service_overalls
      from health_run
      where coalesce(state, 'current') = 'current'
      order by coalesce(committed_at, created_at) asc, created_at asc
    `;
    const runs = z.array(runRowSchema).parse(runRows);
    if (runs.length === 0) {
      return [];
    }
    const charRows = await sql`
      select run_id, coalesce(scope, 'platform') as scope, characteristic, score,
             suppressed_by
      from health_characteristic
      where run_id in ${sql(runs.map((run) => run.run_id))}
    `;
    const parsed = z
      .array(
        characteristicRowSchema.extend({
          run_id: z.string(),
          reasoning: z.string().nullable().optional(),
          recommendations: z.unknown().optional(),
          signals_used: z.unknown().optional(),
        }),
      )
      .parse(charRows);
    const { platform, byService } = groupChars(parsed);
    return runs.map((run) =>
      mapRun(run, platform.get(run.run_id) ?? [], byService.get(run.run_id) ?? new Map()),
    );
  };

  const loadDetailed = async (
    sql: Sql,
    runId: string,
  ): Promise<LatestHealth | undefined> => {
    const runRows = await sql`
      select run_id, commit_sha, commit_message, created_at, overall_score,
             reasoner, trace_id, model, host, agent_identity, rule_set_version,
             state, incomplete, service_overalls
      from health_run
      where run_id = ${runId}
      limit 1
    `;
    const runs = z.array(runRowSchema).parse(runRows);
    const run = runs[0];
    if (run === undefined) {
      return undefined;
    }
    const charRows = await sql`
      select run_id, coalesce(scope, 'platform') as scope, characteristic, score,
             reasoning, recommendations, signals_used, suppressed_by
      from health_characteristic
      where run_id = ${runId}
    `;
    const parsed = z
      .array(characteristicRowSchema.extend({ run_id: z.string() }))
      .parse(charRows);
    const { platform, byService } = groupChars(parsed);
    return mapRun(run, platform.get(run.run_id) ?? [], byService.get(run.run_id) ?? new Map());
  };

  return {
    async loadRuns(): Promise<LatestHealth[]> {
      return withSqlRetry(url, (sql) => load(sql));
    },

    async loadDetailed(runId: string): Promise<LatestHealth | undefined> {
      return withSqlRetry(url, (sql) => loadDetailed(sql, runId));
    },

    async loadLatest(): Promise<LatestHealth | undefined> {
      const runs = await this.loadRuns();
      const latest = runs.at(-1);
      if (latest === undefined) {
        return undefined;
      }
      return (await this.loadDetailed(latest.runId)) ?? latest;
    },

    async loadActiveDecisions() {
      return withSqlRetry(url, async (sql) => {
        const rows = await sql`
          select id, rule_id, path_glob, decision, rationale, decided_by,
                 decided_at, active
          from accepted_decision
          where active = true
        `;
        return z
          .array(
            z.object({
              id: z.string(),
              rule_id: z.string(),
              path_glob: z.string(),
              decision: z.string(),
              rationale: z.string(),
              decided_by: z.string(),
              decided_at: z.union([z.string(), z.date()]),
              active: z.boolean(),
            }),
          )
          .parse(rows)
          .map((row) =>
            acceptedDecisionSchema.parse({
              id: row.id,
              ruleId: row.rule_id,
              pathGlob: row.path_glob,
              decision: row.decision,
              rationale: row.rationale,
              decidedBy: row.decided_by,
              decidedAt: asIso(row.decided_at),
              active: row.active,
            }),
          );
      });
    },
  };
}
