import type { z } from "zod";
import {
  acceptedDecisionSchema,
  analysisPayloadSchema,
  archTestResultSchema,
  archViolationSchema,
  dependencyCruiserSchema,
  duplicationSchema,
  folderMetricSchema,
  runtimeSchema,
} from "./schemas.js";

export type CharacteristicId =
  | "boundary-integrity"
  | "layering"
  | "coupling"
  | "duplication";

export type PlatformCharacteristicId =
  | CharacteristicId
  | "cross-service-integrity";

export type ArchViolation = z.infer<typeof archViolationSchema>;
export type ArchTestResult = z.infer<typeof archTestResultSchema>;
export type FolderMetric = z.infer<typeof folderMetricSchema>;
export type DependencyCruiserPayload = z.infer<typeof dependencyCruiserSchema>;
export type DuplicationPayload = z.infer<typeof duplicationSchema>;
export type RuntimePayload = z.infer<typeof runtimeSchema>;
export type AnalysisPayload = z.infer<typeof analysisPayloadSchema>;
export type AcceptedDecision = z.infer<typeof acceptedDecisionSchema>;

export type CharacteristicScore = {
  id: PlatformCharacteristicId;
  score: number;
  signalsUsed: string[];
  suppressedBy?: string[];
};

export type ServiceScore = {
  service: string;
  overall: number;
  characteristics: CharacteristicScore[];
};

export type ScoreResult = {
  overall: number;
  characteristics: CharacteristicScore[];
  services: ServiceScore[];
};

export { serviceFromPath } from "./paths.js";
export { classifyClone } from "./classify.js";
