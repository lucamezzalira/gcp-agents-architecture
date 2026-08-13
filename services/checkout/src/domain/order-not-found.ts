export class OrderNotFoundError extends Error {
  readonly orderId: string;

  constructor(orderId: string) {
    super(`order not found: ${orderId}`);
    this.name = "OrderNotFoundError";
    this.orderId = orderId;
  }
}
