import { describe, expect, it } from "vitest";
import { MemoryReservationPublisher } from "../infrastructure/memory-reservation-publisher.js";
import { InMemoryOrderStore } from "../infrastructure/in-memory-order-store.js";
import { cancelOrder } from "./cancel-order.js";
import { InvalidTransitionError } from "./invalid-transition.js";
import { OrderNotFoundError } from "./order-not-found.js";
import type { Order } from "./order.js";
import { silentLogger } from "@observability/runtime";
import { placeOrder } from "./place-order.js";
import { CHECKOUT_SKU, CHECKOUT_UNITS } from "./reservation-command.js";

const order: Order = {
  id: "ord-1",
  email: "buyer@example.com",
  status: "pending",
  shippingTier: "standard",
};

describe("placeOrder", () => {
  it("saves the order and publishes a reserve command", async () => {
    const orderStore = new InMemoryOrderStore();
    const reservations = new MemoryReservationPublisher();
    await placeOrder(order, {
      orderStore,
      reservations,
      logger: silentLogger(),
    });
    expect((await orderStore.get(order.id))?.status).toBe("pending");
    expect(reservations.published).toEqual([
      {
        action: "reserve",
        orderId: order.id,
        sku: CHECKOUT_SKU,
        units: CHECKOUT_UNITS,
        order: {
          id: order.id,
          email: order.email,
          status: order.status,
          shippingTier: order.shippingTier,
          lineItems: [
            { sku: CHECKOUT_SKU, units: CHECKOUT_UNITS, name: "Standard item" },
          ],
        },
      },
    ]);
  });
});

describe("cancelOrder", () => {
  it("cancels a pending order and publishes release", async () => {
    const orderStore = new InMemoryOrderStore();
    const reservations = new MemoryReservationPublisher();
    await orderStore.save(order);

    const result = await cancelOrder(order.id, {
      orderStore,
      reservations,
      logger: silentLogger(),
    });

    expect(result.status).toBe("cancelled");
    expect((await orderStore.get(order.id))?.status).toBe("cancelled");
    expect(reservations.published[0]?.action).toBe("release");
  });

  it("does not release when the order is already paid", async () => {
    const orderStore = new InMemoryOrderStore();
    const reservations = new MemoryReservationPublisher();
    await orderStore.save({ ...order, status: "paid" });

    await expect(
      cancelOrder(order.id, {
        orderStore,
        reservations,
        logger: silentLogger(),
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(reservations.published).toHaveLength(0);
  });

  it("fails when the order does not exist", async () => {
    const orderStore = new InMemoryOrderStore();
    const reservations = new MemoryReservationPublisher();
    await expect(
      cancelOrder("missing", {
        orderStore,
        reservations,
        logger: silentLogger(),
      }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
