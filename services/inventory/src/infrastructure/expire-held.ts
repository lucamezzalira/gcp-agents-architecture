import type { Logger } from "@observability/runtime";
import type { OutcomePublisher } from "../domain/ports/outcome-publisher.js";
import type { ReservationStore } from "../domain/ports/reservation-store.js";
import type { Reservation } from "../domain/ports/reservation-store.js";
import type { StockStore } from "../domain/ports/stock-store.js";

export const HELD_TTL_MS = 15 * 60 * 1000;

export type ExpireHeldStores = {
  stock: StockStore;
  reservations: ReservationStore;
  outcomes: OutcomePublisher;
  log: Logger;
};

function pastTtl(row: Reservation, now: Date, ttlMs: number): boolean {
  if (row.status !== "held") {
    return false;
  }
  const started = Date.parse(row.reservedAt);
  if (Number.isNaN(started)) {
    return false;
  }
  return now.getTime() - started >= ttlMs;
}

export async function expireHeldInAdapter(
  stores: ExpireHeldStores,
  now: Date,
  ttlMs: number,
): Promise<number> {
  const held = await stores.reservations.listHeld();
  let released = 0;
  for (const row of held) {
    if (!pastTtl(row, now, ttlMs)) {
      continue;
    }
    const level = await stores.stock.get(row.sku);
    await stores.stock.save({
      sku: row.sku,
      available: (level?.available ?? 0) + row.units,
    });
    await stores.reservations.save({ ...row, status: "expired" });
    await stores.outcomes.publish({
      orderId: row.orderId,
      result: "expired",
      sku: row.sku,
      units: row.units,
    });
    stores.log.withCorrelation(row.orderId).info("held.expired");
    released += 1;
  }
  return released;
}
