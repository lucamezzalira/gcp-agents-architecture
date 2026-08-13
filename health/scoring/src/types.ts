import type { z } from "zod";
import {
  acceptedDecisionSchema,
  analysisPayloadSchema,
  archTestResultSchema,
  archViolationSchema,
  dependencyCruiserSchema,
  duplicationSchema,
  runtimeSchema,
} from "./schemas.js";

export type CharacteristicId =
  | "boundary-integrity"
  | "layering"
  | "coupling"
  | "duplication";

export type ArchViolation = z.infer<typeof archViolationSchema>;
export type ArchTestResult = z.infer<typeof archTestResultSchema>;
export type DependencyCruiserPayload = z.infer<typeof dependencyCruiserSchema>;
export type DuplicationPayload = z.infer<typeof duplicationSchema>;
export type RuntimePayload = z.infer<typeof runtimeSchema>;
export type AnalysisPayload = z.infer<typeof analysisPayloadSchema>;
export type AcceptedDecision = z.infer<typeof acceptedDecisionSchema>;

export type CharacteristicScore = {
  id: CharacteristicId;
  score: number;
  signalsUsed: string[];
  suppressedBy?: string[];
};

export type ScoreResult = {
  overall: number;
  characteristics: CharacteristicScore[];
};
