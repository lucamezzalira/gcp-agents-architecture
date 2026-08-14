import type { Logger } from "./ports/logger.js";
import type { OutcomePublisher } from "./ports/outcome-publisher.js";
import type { ReservationStore } from "./ports/reservation-store.js";
import type { StockStore } from "./ports/stock-store.js";
import type { Reservation } from "./reservation.js";

export const DEFAULT_RESERVATION_TTL_MS = 15 * 60 * 1000;

export type ExpireDeps = {
  stock: StockStore;
  reservations: ReservationStore;
  outcomes: OutcomePublisher;
  logger: Logger;
};

export function isExpired(
  reservation: Reservation,
  now: Date,
  ttlMs: number,
): boolean {
  if (reservation.status !== "held") {
    return false;
  }
  const reservedAt = Date.parse(reservation.reservedAt);
  if (Number.isNaN(reservedAt)) {
    return false;
  }
  return now.getTime() - reservedAt >= ttlMs;
}

export async function expireReservations(
  deps: ExpireDeps,
  now: Date,
  ttlMs: number,
): Promise<number> {
  const held = await deps.reservations.listHeld();
  let expired = 0;
  for (const reservation of held) {
    if (!isExpired(reservation, now, ttlMs)) {
      continue;
    }
    const level = await deps.stock.get(reservation.sku);
    await deps.stock.save({
      sku: reservation.sku,
      available: (level?.available ?? 0) + reservation.units,
    });
    await deps.reservations.save({ ...reservation, status: "expired" });
    await deps.outcomes.publish({
      orderId: reservation.orderId,
      result: "expired",
      sku: reservation.sku,
      units: reservation.units,
    });
    deps.logger.withCorrelation(reservation.orderId).info("reservation.expired");
    expired += 1;
  }
  return expired;
}
