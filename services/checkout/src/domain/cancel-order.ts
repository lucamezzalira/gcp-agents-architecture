import type { Logger } from "@observability/runtime";
import type { OrderStore } from "./ports/order-store.js";
import type { ReservationPublisher } from "./ports/reservation-publisher.js";
import { OrderNotFoundError } from "./order-not-found.js";
import { applyTransition } from "./order-transition.js";
import { releaseCommand } from "./reservation-command.js";

export type CancelOrderDeps = {
  orderStore: OrderStore;
  reservations: ReservationPublisher;
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
  await deps.reservations.publish(releaseCommand(cancelled));
  log.info("reservation.release-published");
  return { status: "cancelled" };
}
