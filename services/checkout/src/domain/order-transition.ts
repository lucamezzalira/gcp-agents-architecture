import { InvalidTransitionError } from "./invalid-transition.js";
import type { Order, OrderStatus } from "./order.js";

const PERMITTED: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return PERMITTED[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function applyTransition(order: Order, to: OrderStatus): Order {
  assertTransition(order.status, to);
  return { ...order, status: to };
}
