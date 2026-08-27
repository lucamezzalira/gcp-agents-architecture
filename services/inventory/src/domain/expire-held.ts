import type { Logger } from "@observability/runtime";
import type { OutcomePublisher } from "./ports/outcome-publisher.js";
import type { ReservationStore } from "./ports/reservation-store.js";
import type { Reservation } from "./ports/reservation-store.js";
import type { StockStore } from "./ports/stock-store.js";

export const HELD_TTL_MS = 15 * 60 * 1000;

export type ExpireHeldDeps = {
  stock: StockStore;
  reservations: ReservationStore;
  outcomes: OutcomePublisher;
  log: Logger;
};

export function pastTtl(row: Reservation, now: Date, ttlMs: number): boolean {
  if (row.status !== "held") {
    return false;
  }
  const started = Date.parse(row.reservedAt);
  if (Number.isNaN(started)) {
    return false;
  }
  return now.getTime() - started >= ttlMs;
}

/** Release held reservations whose reservedAt is older than ttl. */
export async function expireHeld(
  deps: ExpireHeldDeps,
  now: Date,
  ttlMs: number,
): Promise<number> {
  const held = await deps.reservations.listHeld();
  let released = 0;
  for (const row of held) {
    if (!pastTtl(row, now, ttlMs)) {
      continue;
    }
    const level = await deps.stock.get(row.sku);
    await deps.stock.save({
      sku: row.sku,
      available: (level?.available ?? 0) + row.units,
    });
    await deps.reservations.save({ ...row, status: "expired" });
    await deps.outcomes.publish({
      orderId: row.orderId,
      result: "expired",
      sku: row.sku,
      units: row.units,
    });
    deps.log.withCorrelation(row.orderId).info("held.expired");
    released += 1;
  }
  return released;
}
