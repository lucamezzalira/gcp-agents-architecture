import { alertLowStock, type LowStockMailer } from "./alert-low-stock.js";
import type { Logger } from "@observability/runtime";
import type { HoldStock } from "./ports/hold-stock.js";
import type { OutcomePublisher } from "./ports/outcome-publisher.js";
import type { ReservationStore } from "./ports/reservation-store.js";
import type { StockStore } from "./ports/stock-store.js";
import { skuFromOrder, unitsFromOrder } from "./order.js";
import type { ReservationCommand } from "./reservation-command.js";
import { InsufficientStockError } from "./insufficient-stock.js";

export type HandleReservationDeps = {
  stock: StockStore;
  reservations: ReservationStore;
  hold: HoldStock;
  outcomes: OutcomePublisher;
  logger: Logger;
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

function requestedSku(command: ReservationCommand): string {
  return command.order !== undefined
    ? skuFromOrder(command.order)
    : command.sku;
}

function requestedUnits(command: ReservationCommand): number {
  return command.order !== undefined
    ? unitsFromOrder(command.order)
    : command.units;
}

export async function handleReservation(
  command: ReservationCommand,
  deps: HandleReservationDeps,
): Promise<void> {
  const log = deps.logger.withCorrelation(command.orderId);
  const sku = requestedSku(command);
  const units = requestedUnits(command);
  if (command.order !== undefined) {
    log.info("order.snapshot", {
      email: command.order.email,
      status: command.order.status,
      shipping: command.order.shippingTier,
    });
  }
  if (command.action === "reserve") {
    const attempt = await deps.hold.tryHold({
      orderId: command.orderId,
      sku,
      units,
      reservedAt: deps.now().toISOString(),
    });
    if (attempt.kind === "already") {
      const result =
        attempt.reservation.status === "confirmed" ? "confirmed" : "reserved";
      await deps.outcomes.publish({
        orderId: command.orderId,
        result,
        sku: attempt.reservation.sku,
        units: attempt.reservation.units,
      });
      log.info("reserve.idempotent", { status: attempt.reservation.status });
      return;
    }
    if (attempt.kind === "rejected") {
      log.warn("reserve.rejected", { sku, available: attempt.available });
      await deps.outcomes.publish({
        orderId: command.orderId,
        result: "rejected",
        sku,
        units,
      });
      return;
    }
    await deps.outcomes.publish({
      orderId: command.orderId,
      result: "reserved",
      sku,
      units,
    });
    log.info("reserve.held", { sku, units });
    if (deps.lowStock !== undefined) {
      const instruction = await alertLowStock(
        sku,
        attempt.remaining,
        deps.lowStock,
        deps.now(),
      );
      if (instruction !== undefined) {
        log.info("low-stock.published", { remaining: attempt.remaining });
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
