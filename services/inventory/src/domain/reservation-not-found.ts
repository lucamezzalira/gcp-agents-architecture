export class ReservationNotFoundError extends Error {
  readonly orderId: string;

  constructor(orderId: string) {
    super(`reservation not found: ${orderId}`);
    this.name = "ReservationNotFoundError";
    this.orderId = orderId;
  }
}
