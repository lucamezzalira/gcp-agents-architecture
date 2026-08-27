import type { FastifyInstance } from "fastify";
import { getDeliveryStats } from "../domain/delivery-stats.js";
import type { DeliveryStatsSource } from "../domain/delivery-stats.js";
import type { Logger } from "@observability/runtime";

/**
 * Process-local delivery counters for this instance only.
 * Not aggregated across Cloud Run replicas.
 */
export function registerMetricsRoute(
  app: FastifyInstance,
  source: DeliveryStatsSource,
  logger: Logger,
): void {
  app.get("/metrics", async () => {
    logger.withCorrelation("metrics").info("metrics.read");
    return getDeliveryStats(source);
  });
}
