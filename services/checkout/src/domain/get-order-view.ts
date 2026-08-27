import { OrderNotFoundError } from "./order-not-found.js";
import type { Order, OrderStatus, ShippingTier } from "./order.js";
import type { OrderStore } from "./ports/order-store.js";
import type { ReservationOutcomeSink } from "./ports/reservation-outcome-sink.js";

export function confirmationMessageId(orderId: string): string {
  return `checkout:${orderId}:paid`;
}

export type OrderView = {
  id: string;
  email: string;
  status: OrderStatus;
  shippingTier: ShippingTier;
  reservationReady: boolean;
};

export type GetOrderViewDeps = {
  orderStore: OrderStore;
  reservationOutcomes: ReservationOutcomeSink;
};

export async function getOrderView(
  orderId: string,
  deps: GetOrderViewDeps,
): Promise<OrderView> {
  const order: Order | undefined = await deps.orderStore.get(orderId);
  if (order === undefined) {
    throw new OrderNotFoundError(orderId);
  }
  return {
    id: order.id,
    email: order.email,
    status: order.status,
    shippingTier: order.shippingTier,
    reservationReady: await deps.reservationOutcomes.hasReserved(orderId),
  };
}
