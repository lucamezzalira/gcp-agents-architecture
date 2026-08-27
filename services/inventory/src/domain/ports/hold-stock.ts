import type { Reservation } from "../reservation.js";

export type HoldAttempt =
  | { kind: "held"; remaining: number }
  | { kind: "already"; reservation: Reservation }
  | { kind: "rejected"; available: number };

/** Atomically decrements stock and creates a held reservation, or reports an existing hold. */
export type HoldStock = {
  tryHold(input: {
    orderId: string;
    sku: string;
    units: number;
    reservedAt: string;
  }): Promise<HoldAttempt>;
};
