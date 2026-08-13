import { z } from "zod";

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
