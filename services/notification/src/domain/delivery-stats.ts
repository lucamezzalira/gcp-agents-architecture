export type DeliveryStats = {
  delivered: number;
  failed: number;
  averageAttempts: number;
};

export type DeliveryStatsSource = {
  readStats(): Promise<DeliveryStats>;
};

export async function getDeliveryStats(
  source: DeliveryStatsSource,
): Promise<DeliveryStats> {
  return source.readStats();
}
