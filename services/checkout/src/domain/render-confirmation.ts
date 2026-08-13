import type { Order } from "./order.js";

export function renderConfirmation(order: Order): string {
  return `<p>Order ${order.id} is confirmed. It ships within 48 hours.</p>`;
}

export function confirmationBodyRef(orderId: string): string {
  return `orders/${orderId}/confirmation.html`;
}
