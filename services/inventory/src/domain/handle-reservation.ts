import { alertLowStock, type LowStockMailer } from "./alert-low-stock.js";
import type { Log } from "./ports/logger.js";
import type { OutcomePublisher } from "./ports/outcome-publisher.js";
import type { ReservationStore } from "./ports/reservation-store.js";
import type { StockStore } from "./ports/stock-store.js";
import type { ReservationCommand } from "./reservation-command.js";
import type { Reservation } from "./reservation.js";
import { InsufficientStockError } from "./insufficient-stock.js";

export type HandleReservationDeps = {
  stock: StockStore;
  reservations: ReservationStore;
  outcomes: OutcomePublisher;
  logger: Log;
  now: () => Date;
  lowStock?: LowStockMailer;
};

async function restoreUnits(
  stock: StockStore,
  sku: string,
  units: number,
): Promise<void> {
  const level = await stock.get(sku);
  const available = (level?.available ?? 0) + units;
  await stock.save({ sku, available });
}

export async function handleReservation(
  command: ReservationCommand,
  deps: HandleReservationDeps,
): Promise<void> {
  const log = deps.logger.bind(command.orderId);
  if (command.action === "reserve") {
    const level = await deps.stock.get(command.sku);
    const available = level?.available ?? 0;
    if (available < command.units) {
      log.warn("reserve.rejected", { sku: command.sku, available });
      await deps.outcomes.publish({
        orderId: command.orderId,
        result: "rejected",
        sku: command.sku,
        units: command.units,
      });
      return;
    }
    await deps.stock.save({ sku: command.sku, available: available - command.units });
    const held: Reservation = {
      orderId: command.orderId,
      sku: command.sku,
      units: command.units,
      status: "held",
      reservedAt: deps.now().toISOString(),
    };
    await deps.reservations.save(held);
    await deps.outcomes.publish({
      orderId: command.orderId,
      result: "reserved",
      sku: command.sku,
      units: command.units,
    });
    log.info("reserve.held", { sku: command.sku, units: command.units });
    const remaining = available - command.units;
    if (deps.lowStock !== undefined) {
      const instruction = await alertLowStock(
        command.sku,
        remaining,
        deps.lowStock,
        deps.now(),
      );
      if (instruction !== undefined) {
        log.info("low-stock.published", { remaining });
      }
    }
    return;
  }

  const existing = await deps.reservations.get(command.orderId);
  if (existing === undefined || existing.status !== "held") {
    log.warn("reservation.skip", { action: command.action });
    return;
  }

  if (command.action === "release") {
    await restoreUnits(deps.stock, existing.sku, existing.units);
    await deps.reservations.save({ ...existing, status: "released" });
    await deps.outcomes.publish({
      orderId: existing.orderId,
      result: "released",
      sku: existing.sku,
      units: existing.units,
    });
    log.info("reservation.released");
    return;
  }

  await deps.reservations.save({ ...existing, status: "confirmed" });
  await deps.outcomes.publish({
    orderId: existing.orderId,
    result: "confirmed",
    sku: existing.sku,
    units: existing.units,
  });
  log.info("reservation.confirmed");
}

export function assertCanReserve(
  available: number,
  units: number,
  sku: string,
): void {
  if (available < units) {
    throw new InsufficientStockError(sku, units, available);
  }
}
