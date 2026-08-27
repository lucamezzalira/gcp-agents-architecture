export class ReservationNotReadyError extends Error {
  readonly orderId: string;

  constructor(orderId: string) {
    super(`reservation not ready for order ${orderId}`);
    this.name = "ReservationNotReadyError";
    this.orderId = orderId;
  }
}
