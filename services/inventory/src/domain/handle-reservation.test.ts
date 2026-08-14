import { describe, expect, it } from "vitest";
import { handleReservation } from "./handle-reservation.js";
import { quietLog } from "./ports/logger.js";
import { MemoryOutcomes } from "../infrastructure/memory-outcomes.js";
import { MemoryReservations } from "../infrastructure/memory-reservations.js";
import { MemoryStock } from "../infrastructure/memory-stock.js";

function setup() {
  return {
    stock: new MemoryStock(),
    reservations: new MemoryReservations(),
    outcomes: new MemoryOutcomes(),
    logger: quietLog(),
    now: () => new Date("2026-08-14T10:00:00.000Z"),
  };
}

describe("handleReservation", () => {
  it("holds stock and publishes reserved when units are available", async () => {
    const deps = setup();
    await deps.stock.save({ sku: "standard-item", available: 8 });

    await handleReservation(
      { action: "reserve", orderId: "ord-1", sku: "standard-item", units: 2 },
      deps,
    );

    expect((await deps.stock.get("standard-item"))?.available).toBe(6);
    expect((await deps.reservations.get("ord-1"))?.status).toBe("held");
    expect(deps.outcomes.published).toEqual([
      {
        orderId: "ord-1",
        result: "reserved",
        sku: "standard-item",
        units: 2,
      },
    ]);
  });

  it("rejects when stock cannot cover the request", async () => {
    const deps = setup();
    await deps.stock.save({ sku: "standard-item", available: 1 });

    await handleReservation(
      { action: "reserve", orderId: "ord-2", sku: "standard-item", units: 4 },
      deps,
    );

    expect((await deps.stock.get("standard-item"))?.available).toBe(1);
    expect(await deps.reservations.get("ord-2")).toBeUndefined();
    expect(deps.outcomes.published[0]?.result).toBe("rejected");
  });

  it("restores stock on release", async () => {
    const deps = setup();
    await deps.stock.save({ sku: "standard-item", available: 5 });
    await handleReservation(
      { action: "reserve", orderId: "ord-3", sku: "standard-item", units: 3 },
      deps,
    );

    await handleReservation(
      { action: "release", orderId: "ord-3", sku: "standard-item", units: 3 },
      deps,
    );

    expect((await deps.stock.get("standard-item"))?.available).toBe(5);
    expect((await deps.reservations.get("ord-3"))?.status).toBe("released");
    expect(deps.outcomes.published.at(-1)?.result).toBe("released");
  });

  it("reads sku and units from an attached order snapshot", async () => {
    const deps = setup();
    await deps.stock.save({ sku: "standard-item", available: 8 });

    await handleReservation(
      {
        action: "reserve",
        orderId: "ord-5",
        sku: "ignored-sku",
        units: 99,
        order: {
          id: "ord-5",
          email: "buyer@example.com",
          status: "pending",
          shippingTier: "standard",
          lineItems: [
            { sku: "standard-item", units: 2, name: "Standard item" },
          ],
        },
      },
      deps,
    );

    expect((await deps.stock.get("standard-item"))?.available).toBe(6);
    expect(deps.outcomes.published[0]).toEqual({
      orderId: "ord-5",
      result: "reserved",
      sku: "standard-item",
      units: 2,
    });
  });

  it("keeps stock decremented on confirm", async () => {
    const deps = setup();
    await deps.stock.save({ sku: "standard-item", available: 5 });
    await handleReservation(
      { action: "reserve", orderId: "ord-4", sku: "standard-item", units: 1 },
      deps,
    );

    await handleReservation(
      { action: "confirm", orderId: "ord-4", sku: "standard-item", units: 1 },
      deps,
    );

    expect((await deps.stock.get("standard-item"))?.available).toBe(4);
    expect((await deps.reservations.get("ord-4"))?.status).toBe("confirmed");
    expect(deps.outcomes.published.at(-1)?.result).toBe("confirmed");
  });
});
