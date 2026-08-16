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

export const serviceMetricSchema = z.object({
  service: z.string(),
  afferentCoupling: z.number(),
  efferentCoupling: z.number(),
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
  serviceMetrics: z.array(serviceMetricSchema).default([]),
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

export const runtimeProtocolSchema = z.enum(["http", "pubsub"]);

export const runtimeEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  protocol: runtimeProtocolSchema,
  count: z.number().int().nonnegative(),
});

export const runtimeTrafficSchema = z.enum(["this-run", "inherited", "none"]);

export const runtimeCallGraphSchema = z
  .object({
    illustrative: z.literal(false),
    synthetic: z.literal(true),
    description: z.string(),
    window: z.object({
      start: z.string(),
      end: z.string(),
    }),
    traffic: runtimeTrafficSchema.default("none"),
    queried: z.boolean(),
    edges: z.array(runtimeEdgeSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.queried && value.edges === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "a successful query must include edges (empty means no calls in the window)",
        path: ["edges"],
      });
    }
    if (!value.queried && value.edges !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "a failed query must omit edges; an empty graph is not the same as no data",
        path: ["edges"],
      });
    }
  });

export const runtimeVsImportsSchema = z.object({
  runtimeOnly: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      protocol: runtimeProtocolSchema,
    }),
  ),
  importOnly: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
    }),
  ),
});

export const runtimeSignalSchema = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.string(),
  illustrative: z.literal(true).optional(),
});

export const CALL_GRAPH_DESCRIPTION =
  "Service-to-service edges observed from synthetic smoke traffic in Cloud Trace. Not scored.";

export const ILLUSTRATIVE_RUNTIME_SIGNALS = [
  {
    name: "p95-latency",
    value: 120,
    unit: "ms",
    illustrative: true as const,
  },
  {
    name: "error-rate",
    value: 0.01,
    unit: "ratio",
    illustrative: true as const,
  },
];

export function emptyRuntimeCallGraph(
  now = new Date(),
  queried = false,
  traffic: z.infer<typeof runtimeTrafficSchema> = queried
    ? "inherited"
    : "none",
): z.infer<typeof runtimeCallGraphSchema> {
  const base = {
    illustrative: false as const,
    synthetic: true as const,
    description: CALL_GRAPH_DESCRIPTION,
    window: { start: now.toISOString(), end: now.toISOString() },
    traffic,
    queried,
  };
  if (queried) {
    return { ...base, edges: [] };
  }
  return base;
}

export const runtimeSchema = z.object({
  callGraph: runtimeCallGraphSchema.default(() => emptyRuntimeCallGraph()),
  vsImports: runtimeVsImportsSchema.default({
    runtimeOnly: [],
    importOnly: [],
  }),
  signals: z.array(runtimeSignalSchema).default([]),
});

export const messageContractSchema = z.object({
  name: z.string(),
  fields: z.array(z.string()),
  publishers: z.array(z.string()),
  consumers: z.array(z.string()),
});

export const duplicationCountsSchema = z.object({
  internal: z.number(),
  crossService: z.number(),
  shared: z.number(),
  internalByService: z.record(z.string(), z.number()).default({}),
});

export const priorMetricsEntrySchema = z.object({
  commitSha: z.string(),
  modules: z.number(),
  dependencies: z.number(),
  folderInstability: z.record(z.string(), z.number()).default({}),
  duplicationCounts: duplicationCountsSchema.default({
    internal: 0,
    crossService: 0,
    shared: 0,
    internalByService: {},
  }),
  orphanCount: z.number(),
  cycleCount: z.number(),
});

export const analysisPayloadSchema = z.object({
  runId: z.string(),
  commitSha: z.string(),
  commitMessage: z.string(),
  timestamp: z.string(),
  committedAt: z.string().optional(),
  services: z.array(z.string()).default([]),
  archTests: z.array(archTestResultSchema),
  dependencyCruiser: dependencyCruiserSchema,
  duplication: duplicationSchema,
  runtime: runtimeSchema,
  contracts: z.array(messageContractSchema).default([]),
  recentCommits: z
    .array(z.object({ sha: z.string(), message: z.string() }))
    .default([]),
  changedFiles: z.array(z.string()).default([]),
  priorMetrics: z.array(priorMetricsEntrySchema).default([]),
  priorServiceMetrics: z.array(serviceMetricSchema).default([]),
  priorDuplicationCounts: duplicationCountsSchema.optional(),
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
