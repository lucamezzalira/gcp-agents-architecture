import { OrderNotFoundError } from "./order-not-found.js";
import type { Order, OrderStatus, ShippingTier } from "./order.js";
import type { OrderStore } from "./ports/order-store.js";

export function confirmationMessageId(orderId: string): string {
  return `checkout:${orderId}:paid`;
}

export type OrderView = {
  id: string;
  email: string;
  status: OrderStatus;
  shippingTier: ShippingTier;
};

export type GetOrderViewDeps = {
  orderStore: OrderStore;
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
  };
}
