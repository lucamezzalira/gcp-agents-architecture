import type { OrderStatus } from "./order.js";

export class InvalidTransitionError extends Error {
  readonly from: OrderStatus;
  readonly to: OrderStatus;

  constructor(from: OrderStatus, to: OrderStatus) {
    super(`cannot transition order from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}
