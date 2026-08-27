import type { ReservationOutcome } from "../reservation-outcome.js";

export type { ReservationOutcome };

export type ReservationOutcomeSink = {
  record(outcome: ReservationOutcome): Promise<void>;
  /** True when inventory has recorded a successful reserve for this order. */
  hasReserved(orderId: string): Promise<boolean>;
};
