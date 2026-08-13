import type { Order } from "./order.js";

export function renderExpeditedConfirmation(order: Order): string {
  return `<p>Order ${order.id} is confirmed. Expedited dispatch is within 24 hours.</p>`;
}
