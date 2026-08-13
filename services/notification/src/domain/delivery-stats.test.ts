import { describe, expect, it } from "vitest";
import { getDeliveryStats } from "./delivery-stats.js";
import type { DeliveryStats, DeliveryStatsSource } from "./delivery-stats.js";

class StubSource implements DeliveryStatsSource {
  constructor(private readonly stats: DeliveryStats) {}

  async readStats(): Promise<DeliveryStats> {
    return this.stats;
  }
}

describe("getDeliveryStats", () => {
  it("returns whatever the persistence layer already computed", async () => {
    const stats = { delivered: 4, failed: 1, averageAttempts: 2.4 };
    await expect(getDeliveryStats(new StubSource(stats))).resolves.toEqual(stats);
  });
});
