import type { ReservationOutcome } from "../reservation-outcome.js";

export type { ReservationOutcome };

export type OutcomePublisher = {
  publish(outcome: ReservationOutcome): Promise<void>;
};
