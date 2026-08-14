import type { Logger } from "./ports/logger.js";
import type { OrderStore } from "./ports/order-store.js";
import type { StockReservationPublisher } from "./ports/stock-reservation-publisher.js";
import type { Order } from "./order.js";
import { reserveCommand } from "./stock-command.js";

export type PlaceOrderDeps = {
  orderStore: OrderStore;
  stockReservations: StockReservationPublisher;
  logger: Logger;
};

export async function placeOrder(
  order: Order,
  deps: PlaceOrderDeps,
): Promise<void> {
  const log = deps.logger.withCorrelation(order.id);
  await deps.orderStore.save(order);
  await deps.stockReservations.publish(reserveCommand(order));
  log.info("stock.reserve-published");
}
