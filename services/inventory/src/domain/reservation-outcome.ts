export const OUTCOME_RESULTS = [
  "reserved",
  "rejected",
  "released",
  "confirmed",
  "expired",
] as const;

export type OutcomeResult = (typeof OUTCOME_RESULTS)[number];

export type ReservationOutcome = {
  orderId: string;
  result: OutcomeResult;
  sku: string;
  units: number;
};

export function isOutcomeResult(value: string): value is OutcomeResult {
  return (OUTCOME_RESULTS as readonly string[]).includes(value);
}
