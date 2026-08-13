import postgres from "postgres";
import { z } from "zod";
import type { HealthStore, LatestHealth } from "./types.js";
import { acceptedDecisionSchema } from "./schemas.js";

const runRowSchema = z.object({
  run_id: z.string(),
  commit_sha: z.string(),
  commit_message: z.string().nullable(),
  created_at: z.union([z.string(), z.date()]),
  overall_score: z.coerce.number(),
});

const characteristicRowSchema = z.object({
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
  if (!parsed.success) {
    return [];
  }
  return parsed.data;
}

export function databaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    "postgresql://health:health@127.0.0.1:5433/health"
  );
}

export function createPostgresStore(url = databaseUrl()): HealthStore {
  const sql = postgres(url, { max: 4 });

  return {
    async loadLatest(): Promise<LatestHealth | undefined> {
      const runs = await sql`
        select run_id, commit_sha, commit_message, created_at, overall_score
        from health_run
        order by created_at desc
        limit 1
      `;
      const runParsed = z.array(runRowSchema).safeParse(runs);
      const run = runParsed.success ? runParsed.data[0] : undefined;
      if (run === undefined) {
        return undefined;
      }
      const rows = await sql`
        select characteristic, score, reasoning, recommendations, signals_used
        from health_characteristic
        where run_id = ${run.run_id}
      `;
      const characteristics = z
        .array(characteristicRowSchema)
        .parse(rows)
        .map((row) => ({
          id: row.characteristic,
          score: row.score,
          reasoning: row.reasoning ?? "",
          recommendations: asStringArray(row.recommendations),
          signalsUsed: asStringArray(row.signals_used),
        }));
      return {
        runId: run.run_id,
        commitSha: run.commit_sha,
        commitMessage: run.commit_message ?? "",
        createdAt: asIso(run.created_at),
        overall: run.overall_score,
        characteristics,
      };
    },

    async loadActiveDecisions() {
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
    },
  };
}
