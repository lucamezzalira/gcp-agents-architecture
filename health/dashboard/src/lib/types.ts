export type CharacteristicRead = {
  id: string;
  score: number;
  reasoning: string;
  recommendations: string[];
  signalsUsed: string[];
};

export type HealthRun = {
  runId: string;
  commitSha: string;
  commitMessage: string;
  createdAt: string;
  overall: number;
  reasoner?: string;
  traceId?: string;
  characteristics: CharacteristicRead[];
};

export type HealthStore = {
  loadRuns(): Promise<HealthRun[]>;
};

export const CHARACTERISTIC_ORDER = [
  "boundary-integrity",
  "layering",
  "coupling",
  "duplication",
] as const;
