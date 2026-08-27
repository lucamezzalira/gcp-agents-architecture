import { describe, expect, it } from "vitest";
import { InMemoryOrderStore } from "../infrastructure/in-memory-order-store.js";
import { MemoryReservationOutcomes } from "../infrastructure/memory-reservation-outcomes.js";
import { getOrderView } from "./get-order-view.js";
import { OrderNotFoundError } from "./order-not-found.js";
import type { Order } from "./order.js";

const order: Order = {
  id: "ord-1",
  email: "buyer@example.com",
  status: "paid",
  shippingTier: "standard",
};

describe("getOrderView", () => {
  it("returns the order fields checkout owns plus reservation readiness", async () => {
    const orderStore = new InMemoryOrderStore();
    const reservationOutcomes = new MemoryReservationOutcomes();
    await orderStore.save(order);
    await reservationOutcomes.record({
      orderId: order.id,
      result: "reserved",
      sku: "standard-item",
      units: 1,
    });

    const view = await getOrderView(order.id, { orderStore, reservationOutcomes });
    expect(view).toEqual({
      id: order.id,
      email: order.email,
      status: "paid",
      shippingTier: "standard",
      reservationReady: true,
    });
  });

  it("fails when the order does not exist", async () => {
    await expect(
      getOrderView("missing", {
        orderStore: new InMemoryOrderStore(),
        reservationOutcomes: new MemoryReservationOutcomes(),
      }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
