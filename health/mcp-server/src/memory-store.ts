import type {
  AcceptedDecision,
  HealthStore,
  LatestHealth,
} from "./types.js";

export class InMemoryHealthStore implements HealthStore {
  latest: LatestHealth | undefined;
  runs: LatestHealth[] = [];
  decisions: AcceptedDecision[] = [];

  async loadLatest(): Promise<LatestHealth | undefined> {
    const runs = await this.loadRuns();
    return runs.at(-1);
  }

  async loadRuns(): Promise<LatestHealth[]> {
    if (this.runs.length > 0) {
      return this.runs;
    }
    return this.latest === undefined ? [] : [this.latest];
  }

  async loadActiveDecisions(): Promise<AcceptedDecision[]> {
    return this.decisions.filter((item) => item.active);
  }
}
