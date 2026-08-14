import postgres from "postgres";
import { z } from "zod";
import {
  CHARACTERISTIC_ORDER,
  type CharacteristicRead,
  type HealthRun,
  type HealthStore,
  type ObservedRuntimeEdge,
  type ServiceRead,
} from "./types.js";

const runRowSchema = z.object({
  run_id: z.string(),
  commit_sha: z.string(),
  commit_message: z.string().nullable(),
  created_at: z.union([z.string(), z.date()]),
  overall_score: z.coerce.number(),
  reasoner: z.string().nullable().optional(),
  trace_id: z.string().nullable().optional(),
  rule_set_version: z.coerce.number().nullable().optional(),
  state: z.string().nullable().optional(),
  superseded_at: z.union([z.string(), z.date()]).nullable().optional(),
  superseded_by: z.string().nullable().optional(),
  service_overalls: z.unknown().optional(),
  metrics: z.unknown().optional(),
});

const characteristicRowSchema = z.object({
  run_id: z.string(),
  scope: z.string().nullable().optional(),
  characteristic: z.string(),
  score: z.coerce.number(),
  reasoning: z.string().nullable(),
  recommendations: z.unknown(),
  signals_used: z.unknown(),
  suppressed_by: z.unknown().optional(),
});

function asIso(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString();
}

function asStringArray(value: unknown): string[] {
  const parsed = z.array(z.string()).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function asRuntimeEdges(value: unknown): ObservedRuntimeEdge[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [];
  }
  const metrics = value as { runtimeEdges?: unknown };
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
    .safeParse(metrics.runtimeEdges);
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
  reasoning: string | null;
  recommendations: unknown;
  signals_used: unknown;
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

export function databaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    "postgresql://health:health@127.0.0.1:5433/health"
  );
}

export type PostgresTarget =
  | { kind: "url"; url: string }
  | {
      kind: "socket";
      host: string;
      database: string;
      username: string;
      password: string;
    };

export function postgresTarget(url: string): PostgresTarget {
  const socketMatch = url.match(/[?&]host=(\/[^&]*)/);
  if (socketMatch === null || socketMatch[1] === undefined) {
    return { kind: "url", url };
  }
  const parsed = new URL(url.replace("@/", "@unused/"));
  return {
    kind: "socket",
    host: decodeURIComponent(socketMatch[1]),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  };
}

type Sql = ReturnType<typeof postgres>;

const clients = new Map<string, Sql>();

function sqlClient(url: string): Sql {
  const existing = clients.get(url);
  if (existing !== undefined) {
    return existing;
  }
  const options = {
    max: 1,
    idle_timeout: 0,
    connect_timeout: 8,
    connection: {
      statement_timeout: 8000,
    },
  } as const;
  const target = postgresTarget(url);
  const sql =
    target.kind === "url"
      ? postgres(target.url, options)
      : postgres({
          host: target.host,
          database: target.database,
          username: target.username,
          password: target.password,
          ...options,
        });
  clients.set(url, sql);
  return sql;
}

export function createPostgresStore(url = databaseUrl()): HealthStore {
  const sql = sqlClient(url);

  return {
    async loadRuns(options?: { includeSuperseded?: boolean }): Promise<HealthRun[]> {
      const includeSuperseded = options?.includeSuperseded === true;
      const runRows = includeSuperseded
        ? await sql`
            select run_id, commit_sha, commit_message, created_at, overall_score,
                   reasoner, trace_id, rule_set_version, state, superseded_at,
                   superseded_by, service_overalls, metrics
            from health_run
            order by created_at asc
          `
        : await sql`
            select run_id, commit_sha, commit_message, created_at, overall_score,
                   reasoner, trace_id, rule_set_version, state, superseded_at,
                   superseded_by, service_overalls, metrics
            from health_run
            where coalesce(state, 'current') = 'current'
            order by created_at asc
          `;
      const runs = z.array(runRowSchema).parse(runRows);
      if (runs.length === 0) {
        return [];
      }
      const charRows = await sql`
        select run_id, coalesce(scope, 'platform') as scope, characteristic, score,
               reasoning, recommendations, signals_used, suppressed_by
        from health_characteristic
        where run_id in ${sql(runs.map((run) => run.run_id))}
      `;
      const platform = new Map<string, CharacteristicRead[]>();
      const byService = new Map<string, Map<string, CharacteristicRead[]>>();
      for (const row of z.array(characteristicRowSchema).parse(charRows)) {
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
        const runtimeEdges = asRuntimeEdges(run.metrics);
        return {
          runId: run.run_id,
          commitSha: run.commit_sha,
          commitMessage: run.commit_message ?? "",
          createdAt: asIso(run.created_at),
          overall: run.overall_score,
          reasoner: run.reasoner ?? undefined,
          traceId: run.trace_id ?? undefined,
          ruleSetVersion: run.rule_set_version ?? 1,
          state: run.state ?? "current",
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
    },
  };
}
