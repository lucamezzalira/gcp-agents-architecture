import type {
  AcceptedDecision,
  HealthStore,
  LatestHealth,
} from "./types.js";

export class InMemoryHealthStore implements HealthStore {
  latest: LatestHealth | undefined;
  decisions: AcceptedDecision[] = [];

  async loadLatest(): Promise<LatestHealth | undefined> {
    return this.latest;
  }

  async loadActiveDecisions(): Promise<AcceptedDecision[]> {
    return this.decisions.filter((item) => item.active);
  }
}
