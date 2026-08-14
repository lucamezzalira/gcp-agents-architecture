import { describe, expect, it } from "vitest";
import { expireReservations, isExpired } from "./expire-reservations.js";
import { quietLogger } from "./ports/logger.js";
import { MemoryOutcomes } from "../infrastructure/memory-outcomes.js";
import { MemoryReservations } from "../infrastructure/memory-reservations.js";
import { MemoryStock } from "../infrastructure/memory-stock.js";
import type { Reservation } from "./reservation.js";

const held: Reservation = {
  orderId: "ord-exp",
  sku: "standard-item",
  units: 2,
  status: "held",
  reservedAt: "2026-08-14T09:00:00.000Z",
};

describe("expireReservations", () => {
  it("treats a held reservation past ttl as expired", () => {
    expect(
      isExpired(held, new Date("2026-08-14T09:20:00.000Z"), 15 * 60 * 1000),
    ).toBe(true);
    expect(
      isExpired(held, new Date("2026-08-14T09:10:00.000Z"), 15 * 60 * 1000),
    ).toBe(false);
  });

  it("restores stock and publishes expired for stale holds", async () => {
    const stock = new MemoryStock();
    const reservations = new MemoryReservations();
    const outcomes = new MemoryOutcomes();
    await stock.save({ sku: "standard-item", available: 3 });
    await reservations.save(held);

    const count = await expireReservations(
      { stock, reservations, outcomes, logger: quietLogger() },
      new Date("2026-08-14T09:20:00.000Z"),
      15 * 60 * 1000,
    );

    expect(count).toBe(1);
    expect((await stock.get("standard-item"))?.available).toBe(5);
    expect((await reservations.get("ord-exp"))?.status).toBe("expired");
    expect(outcomes.published).toEqual([
      {
        orderId: "ord-exp",
        result: "expired",
        sku: "standard-item",
        units: 2,
      },
    ]);
  });
});
