import type { ReservationOutcome } from "../reservation-outcome.js";

export type { ReservationOutcome };

export type OutcomeResult = ReservationOutcome["result"];

export type ReservationOutcomeSink = {
  record(outcome: ReservationOutcome): Promise<void>;
  /** True when inventory has recorded a successful reserve for this order. */
  hasReserved(orderId: string): Promise<boolean>;
};

/**
 * Monotonic reservation-status transitions. Terminal results ignore later
 * reserved outcomes so a late Pub/Sub redelivery cannot resurrect pay after expire.
 */
export function canAdvanceOutcome(
  from: OutcomeResult | undefined,
  to: OutcomeResult,
): boolean {
  if (from === undefined) {
    return true;
  }
  if (from === to) {
    return true;
  }
  if (from === "reserved") {
    return (
      to === "confirmed" ||
      to === "released" ||
      to === "expired" ||
      to === "rejected"
    );
  }
  return false;
}

export function isPayReady(result: OutcomeResult | undefined): boolean {
  return result === "reserved" || result === "confirmed";
}
