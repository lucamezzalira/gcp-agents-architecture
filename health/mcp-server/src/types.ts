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

export type LatestHealth = {
  runId: string;
  commitSha: string;
  commitMessage: string;
  createdAt: string;
  overall: number;
  reasoner?: string;
  traceId?: string;
  ruleSetVersion?: number;
  state?: string;
  characteristics: CharacteristicRead[];
  services: ServiceRead[];
};

export type AcceptedDecision = {
  id: string;
  ruleId: string;
  pathGlob: string;
  decision: string;
  rationale: string;
  decidedBy: string;
  decidedAt: string;
  active: boolean;
};

export type HealthRunSummary = {
  runId: string;
  commitSha: string;
  commitMessage: string;
  createdAt: string;
  overall: number;
  reasoner?: string;
  traceId?: string;
  ruleSetVersion?: number;
  state?: string;
  characteristics: Array<{ id: string; score: number }>;
  services: Array<{ service: string; overall: number }>;
};

export type HealthStore = {
  loadLatest(): Promise<LatestHealth | undefined>;
  loadRuns(): Promise<LatestHealth[]>;
  loadActiveDecisions(): Promise<AcceptedDecision[]>;
};

export const CHARACTERISTICS = [
  {
    id: "boundary-integrity",
    what: "Whether a service's own files respect declared boundaries",
  },
  {
    id: "layering",
    what: "Whether the transport, domain and infrastructure separation holds",
  },
  {
    id: "coupling",
    what: "Cycles, orphans, and folder instability inside a service",
  },
  {
    id: "duplication",
    what: "Internal clones inside one service",
  },
  {
    id: "cross-service-integrity",
    what: "Rules 3 to 5 and 7, plus clones that span services",
  },
] as const;
