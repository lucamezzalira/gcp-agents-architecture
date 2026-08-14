import type { Logger } from "@observability/runtime";
import type { OrderStore } from "./ports/order-store.js";
import type { StockReservationPublisher } from "./ports/stock-reservation-publisher.js";
import { OrderNotFoundError } from "./order-not-found.js";
import { applyTransition } from "./order-transition.js";
import { releaseCommand } from "./stock-command.js";

export type CancelOrderDeps = {
  orderStore: OrderStore;
  stockReservations: StockReservationPublisher;
  logger: Logger;
};

export async function cancelOrder(
  orderId: string,
  deps: CancelOrderDeps,
): Promise<{ status: "cancelled" }> {
  const log = deps.logger.withCorrelation(orderId);
  const order = await deps.orderStore.get(orderId);
  if (order === undefined) {
    throw new OrderNotFoundError(orderId);
  }
  const cancelled = applyTransition(order, "cancelled");
  await deps.orderStore.save(cancelled);
  await deps.stockReservations.publish(releaseCommand(cancelled));
  log.info("stock.release-published");
  return { status: "cancelled" };
}
