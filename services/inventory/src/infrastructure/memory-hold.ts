import type { HoldAttempt, HoldStock } from "../domain/ports/hold-stock.js";
import type { ReservationStore } from "../domain/ports/reservation-store.js";
import type { StockStore } from "../domain/ports/stock-store.js";

export class MemoryHold implements HoldStock {
  constructor(
    private readonly stock: StockStore,
    private readonly reservations: ReservationStore,
  ) {}

  async tryHold(input: {
    orderId: string;
    sku: string;
    units: number;
    reservedAt: string;
  }): Promise<HoldAttempt> {
    const existing = await this.reservations.get(input.orderId);
    if (existing !== undefined) {
      if (
        (existing.status === "held" || existing.status === "confirmed") &&
        existing.sku === input.sku &&
        existing.units === input.units
      ) {
        return { kind: "already", reservation: existing };
      }
      return {
        kind: "rejected",
        available: (await this.stock.get(input.sku))?.available ?? 0,
      };
    }
    const level = await this.stock.get(input.sku);
    const available = level?.available ?? 0;
    if (available < input.units) {
      return { kind: "rejected", available };
    }
    const remaining = available - input.units;
    await this.stock.save({ sku: input.sku, available: remaining });
    await this.reservations.save({
      orderId: input.orderId,
      sku: input.sku,
      units: input.units,
      status: "held",
      reservedAt: input.reservedAt,
    });
    return { kind: "held", remaining };
  }
};
