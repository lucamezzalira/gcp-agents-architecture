import { z } from "zod";

export const archViolationSchema = z.object({
  file: z.string(),
  detail: z.string(),
});

export const archTestResultSchema = z.object({
  ruleId: z.string(),
  passed: z.boolean(),
  violations: z.array(archViolationSchema),
});

export const dependencyCruiserSchema = z.object({
  cycles: z.array(z.object({ path: z.array(z.string()) })),
  orphans: z.array(z.string()),
  violations: z.array(
    z.object({
      rule: z.string(),
      from: z.string(),
      to: z.string(),
    }),
  ),
  metrics: z.object({
    modules: z.number(),
    dependencies: z.number(),
  }),
});

export const duplicationSchema = z.object({
  clones: z.array(
    z.object({
      files: z.array(z.string()),
      lines: z.number(),
      tokens: z.number(),
    }),
  ),
  percentage: z.number(),
});

export const runtimeSchema = z.object({
  illustrative: z.literal(true),
  signals: z.array(
    z.object({
      name: z.string(),
      value: z.number(),
      unit: z.string(),
    }),
  ),
});

export const analysisPayloadSchema = z.object({
  runId: z.string(),
  commitSha: z.string(),
  commitMessage: z.string(),
  timestamp: z.string(),
  archTests: z.array(archTestResultSchema),
  dependencyCruiser: dependencyCruiserSchema,
  duplication: duplicationSchema,
  runtime: runtimeSchema,
  recentCommits: z
    .array(z.object({ sha: z.string(), message: z.string() }))
    .default([]),
});

export const acceptedDecisionSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  pathGlob: z.string(),
  decision: z.string(),
  rationale: z.string(),
  decidedBy: z.string(),
  decidedAt: z.string(),
  active: z.boolean(),
});
