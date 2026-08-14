import { z } from "zod";

export const archViolationSchema = z.object({
  file: z.string(),
  detail: z.string(),
  service: z.string().optional(),
});

export const archTestResultSchema = z.object({
  ruleId: z.string(),
  passed: z.boolean(),
  violations: z.array(archViolationSchema),
});

export const folderMetricSchema = z.object({
  folder: z.string(),
  afferentCoupling: z.number(),
  efferentCoupling: z.number(),
  instability: z.number(),
  moduleCount: z.number().optional(),
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
  folderMetrics: z.array(folderMetricSchema).default([]),
});

export const cloneClassificationSchema = z.enum([
  "internal",
  "cross-service",
  "shared",
]);

export const duplicationSchema = z.object({
  clones: z.array(
    z.object({
      files: z.array(z.string()),
      lines: z.number(),
      tokens: z.number(),
      classification: cloneClassificationSchema.optional(),
      services: z.array(z.string()).optional(),
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

export const priorMetricsEntrySchema = z.object({
  commitSha: z.string(),
  modules: z.number(),
  dependencies: z.number(),
  folderInstability: z.record(z.string(), z.number()).default({}),
  duplicationCounts: z
    .object({
      internal: z.number(),
      crossService: z.number(),
      shared: z.number(),
    })
    .default({ internal: 0, crossService: 0, shared: 0 }),
  orphanCount: z.number(),
  cycleCount: z.number(),
});

export const analysisPayloadSchema = z.object({
  runId: z.string(),
  commitSha: z.string(),
  commitMessage: z.string(),
  timestamp: z.string(),
  services: z.array(z.string()).default([]),
  archTests: z.array(archTestResultSchema),
  dependencyCruiser: dependencyCruiserSchema,
  duplication: duplicationSchema,
  runtime: runtimeSchema,
  recentCommits: z
    .array(z.object({ sha: z.string(), message: z.string() }))
    .default([]),
  changedFiles: z.array(z.string()).default([]),
  priorMetrics: z.array(priorMetricsEntrySchema).default([]),
  ruleSetVersion: z.number().int().default(1),
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
  scope: z.string().default("platform"),
});
