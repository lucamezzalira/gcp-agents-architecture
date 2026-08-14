import type {
  DeliveryStats,
  DeliveryStatsSource,
} from "./ports/delivery-stats.js";

export type { DeliveryStats, DeliveryStatsSource };

export async function getDeliveryStats(
  source: DeliveryStatsSource,
): Promise<DeliveryStats> {
  return source.readStats();
}
