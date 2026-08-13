import type {
  DeliveryStats,
  DeliveryStatsSource,
} from "../domain/delivery-stats.js";

export class InMemoryDeliveryStats implements DeliveryStatsSource {
  private delivered = 0;
  private failed = 0;
  private attemptSum = 0;

  record(outcome: "delivered" | "failed", attempts: number): void {
    if (outcome === "delivered") {
      this.delivered += 1;
    } else {
      this.failed += 1;
    }
    this.attemptSum += attempts;
  }

  async readStats(): Promise<DeliveryStats> {
    const outcomes = this.delivered + this.failed;
    return {
      delivered: this.delivered,
      failed: this.failed,
      averageAttempts: outcomes === 0 ? 0 : this.attemptSum / outcomes,
    };
  }
}
