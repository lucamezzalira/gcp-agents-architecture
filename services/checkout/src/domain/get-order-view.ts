import type { DeliveryStatusLookup } from "./delivery-status-lookup.js";
import { OrderNotFoundError } from "./order-not-found.js";
import type { Order, OrderStatus, ShippingTier } from "./order.js";
import type { OrderStore } from "./order-store.js";

export function confirmationMessageId(orderId: string): string {
  return `checkout:${orderId}:paid`;
}

export type OrderView = {
  id: string;
  email: string;
  status: OrderStatus;
  shippingTier: ShippingTier;
  confirmationDelivered: boolean;
};

export type GetOrderViewDeps = {
  orderStore: OrderStore;
  deliveryStatus: DeliveryStatusLookup;
};

export async function getOrderView(
  orderId: string,
  deps: GetOrderViewDeps,
): Promise<OrderView> {
  const order: Order | undefined = await deps.orderStore.get(orderId);
  if (order === undefined) {
    throw new OrderNotFoundError(orderId);
  }
  const confirmationDelivered = await deps.deliveryStatus.wasDelivered(
    confirmationMessageId(order.id),
  );
  return {
    id: order.id,
    email: order.email,
    status: order.status,
    shippingTier: order.shippingTier,
    confirmationDelivered,
  };
}
