export type DeliveryStats = {
  delivered: number;
  failed: number;
  averageAttempts: number;
};

export type DeliveryStatsSource = {
  readStats(): Promise<DeliveryStats>;
};
