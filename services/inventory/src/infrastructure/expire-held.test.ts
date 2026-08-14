import { describe, expect, it } from "vitest";
import { silentLogger } from "@observability/runtime";
import { expireHeldInAdapter } from "./expire-held.js";
import { MemoryOutcomes } from "./memory-outcomes.js";
import { MemoryReservations } from "./memory-reservations.js";
import { MemoryStock } from "./memory-stock.js";

describe("expireHeldInAdapter", () => {
  it("releases unconfirmed holds whose reservedAt is older than ttl", async () => {
    const stock = new MemoryStock();
    const reservations = new MemoryReservations();
    const outcomes = new MemoryOutcomes();
    await stock.save({ sku: "standard-item", available: 3 });
    await reservations.save({
      orderId: "ord-exp",
      sku: "standard-item",
      units: 2,
      status: "held",
      reservedAt: "2026-08-14T09:00:00.000Z",
    });

    const count = await expireHeldInAdapter(
      { stock, reservations, outcomes, log: silentLogger() },
      new Date("2026-08-14T09:20:00.000Z"),
      15 * 60 * 1000,
    );

    expect(count).toBe(1);
    expect((await stock.get("standard-item"))?.available).toBe(5);
    expect((await reservations.get("ord-exp"))?.status).toBe("expired");
    expect(outcomes.published[0]?.result).toBe("expired");
  });

  it("leaves a fresh hold in place", async () => {
    const stock = new MemoryStock();
    const reservations = new MemoryReservations();
    const outcomes = new MemoryOutcomes();
    await stock.save({ sku: "standard-item", available: 3 });
    await reservations.save({
      orderId: "ord-fresh",
      sku: "standard-item",
      units: 1,
      status: "held",
      reservedAt: "2026-08-14T09:18:00.000Z",
    });

    const count = await expireHeldInAdapter(
      { stock, reservations, outcomes, log: silentLogger() },
      new Date("2026-08-14T09:20:00.000Z"),
      15 * 60 * 1000,
    );

    expect(count).toBe(0);
    expect((await reservations.get("ord-fresh"))?.status).toBe("held");
    expect(outcomes.published).toHaveLength(0);
  });
});
