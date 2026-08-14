export type CharacteristicRead = {
  id: string;
  score: number;
  reasoning: string;
  recommendations: string[];
  signalsUsed: string[];
  suppressedBy?: string[];
};

export type ServiceRead = {
  service: string;
  overall: number;
  characteristics: CharacteristicRead[];
};

export type ObservedRuntimeEdge = {
  from: string;
  to: string;
  protocol: string;
  count?: number;
};

export type HealthRun = {
  runId: string;
  commitSha: string;
  commitMessage: string;
  createdAt: string;
  overall: number;
  reasoner?: string;
  traceId?: string;
  ruleSetVersion?: number;
  state?: string;
  supersededAt?: string;
  supersededBy?: string;
  characteristics: CharacteristicRead[];
  services: ServiceRead[];
  runtimeEdges?: ObservedRuntimeEdge[];
};

export type HealthStore = {
  loadRuns(options?: { includeSuperseded?: boolean }): Promise<HealthRun[]>;
};

export const CHARACTERISTIC_ORDER = [
  "boundary-integrity",
  "layering",
  "coupling",
  "duplication",
  "cross-service-integrity",
] as const;
