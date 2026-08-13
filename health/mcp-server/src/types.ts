export type CharacteristicRead = {
  id: string;
  score: number;
  reasoning: string;
  recommendations: string[];
  signalsUsed: string[];
};

export type LatestHealth = {
  runId: string;
  commitSha: string;
  commitMessage: string;
  createdAt: string;
  overall: number;
  characteristics: CharacteristicRead[];
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

export type HealthStore = {
  loadLatest(): Promise<LatestHealth | undefined>;
  loadActiveDecisions(): Promise<AcceptedDecision[]>;
};

export const CHARACTERISTICS = [
  {
    id: "boundary-integrity",
    what: "Whether service boundaries hold, especially provider access",
  },
  {
    id: "layering",
    what: "Whether the transport, domain and infrastructure separation holds",
  },
  {
    id: "coupling",
    what: "Structural coupling between and within services",
  },
  {
    id: "duplication",
    what: "Repeated code across the codebase",
  },
] as const;
