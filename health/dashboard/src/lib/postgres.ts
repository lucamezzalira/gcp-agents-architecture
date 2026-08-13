import postgres from "postgres";
import { z } from "zod";
import {
  CHARACTERISTIC_ORDER,
  type CharacteristicRead,
  type HealthRun,
  type HealthStore,
} from "./types.js";

const runRowSchema = z.object({
  run_id: z.string(),
  commit_sha: z.string(),
  commit_message: z.string().nullable(),
  created_at: z.union([z.string(), z.date()]),
  overall_score: z.coerce.number(),
});

const characteristicRowSchema = z.object({
  run_id: z.string(),
  characteristic: z.string(),
  score: z.coerce.number(),
  reasoning: z.string().nullable(),
  recommendations: z.unknown(),
  signals_used: z.unknown(),
});

function asIso(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString();
}

function asStringArray(value: unknown): string[] {
  const parsed = z.array(z.string()).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function sortCharacteristics(
  items: CharacteristicRead[],
): CharacteristicRead[] {
  const rank = new Map(
    CHARACTERISTIC_ORDER.map((id, index) => [id, index] as const),
  );
  return [...items].sort((left, right) => {
    const leftRank = rank.get(left.id as (typeof CHARACTERISTIC_ORDER)[number]) ?? 99;
    const rightRank = rank.get(right.id as (typeof CHARACTERISTIC_ORDER)[number]) ?? 99;
    return leftRank - rightRank;
  });
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

function sqlClient(url: string) {
  const target = postgresTarget(url);
  if (target.kind === "url") {
    return postgres(target.url, { max: 4 });
  }
  return postgres({
    host: target.host,
    database: target.database,
    username: target.username,
    password: target.password,
    max: 4,
  });
}

export function createPostgresStore(url = databaseUrl()): HealthStore {
  const sql = sqlClient(url);

  return {
    async loadRuns(): Promise<HealthRun[]> {
      const runRows = await sql`
        select run_id, commit_sha, commit_message, created_at, overall_score
        from health_run
        order by created_at asc
      `;
      const runs = z.array(runRowSchema).parse(runRows);
      if (runs.length === 0) {
        return [];
      }
      const charRows = await sql`
        select run_id, characteristic, score, reasoning, recommendations, signals_used
        from health_characteristic
      `;
      const grouped = new Map<string, CharacteristicRead[]>();
      for (const row of z.array(characteristicRowSchema).parse(charRows)) {
        const list = grouped.get(row.run_id) ?? [];
        list.push({
          id: row.characteristic,
          score: row.score,
          reasoning: row.reasoning ?? "",
          recommendations: asStringArray(row.recommendations),
          signalsUsed: asStringArray(row.signals_used),
        });
        grouped.set(row.run_id, list);
      }
      return runs.map((run) => ({
        runId: run.run_id,
        commitSha: run.commit_sha,
        commitMessage: run.commit_message ?? "",
        createdAt: asIso(run.created_at),
        overall: run.overall_score,
        characteristics: sortCharacteristics(grouped.get(run.run_id) ?? []),
      }));
    },
  };
}
