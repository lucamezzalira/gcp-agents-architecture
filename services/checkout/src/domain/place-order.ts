import type { Logger } from "@observability/runtime";
import type { OrderStore } from "./ports/order-store.js";
import type { ReservationPublisher } from "./ports/reservation-publisher.js";
import type { Order } from "./order.js";
import { reserveCommand } from "./reservation-command.js";

export type PlaceOrderDeps = {
  orderStore: OrderStore;
  reservations: ReservationPublisher;
  logger: Logger;
};

export async function placeOrder(
  order: Order,
  deps: PlaceOrderDeps,
): Promise<void> {
  const log = deps.logger.withCorrelation(order.id);
  await deps.orderStore.save(order);
  await deps.reservations.publish(reserveCommand(order));
  log.info("reservation.reserve-published");
}
