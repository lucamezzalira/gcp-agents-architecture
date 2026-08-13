import { describe, expect, it } from "vitest";
import { InMemoryDeliveryStatusLookup } from "../infrastructure/in-memory-delivery-status-lookup.js";
import { InMemoryOrderStore } from "../infrastructure/in-memory-order-store.js";
import { confirmationMessageId, getOrderView } from "./get-order-view.js";
import { OrderNotFoundError } from "./order-not-found.js";
import type { Order } from "./order.js";

const order: Order = {
  id: "ord-1",
  email: "buyer@example.com",
  status: "paid",
  shippingTier: "standard",
};

describe("getOrderView", () => {
  it("includes confirmation delivery status", async () => {
    const orderStore = new InMemoryOrderStore();
    const deliveryStatus = new InMemoryDeliveryStatusLookup();
    await orderStore.save(order);

    const before = await getOrderView(order.id, { orderStore, deliveryStatus });
    expect(before.confirmationDelivered).toBe(false);

    deliveryStatus.markDelivered(confirmationMessageId(order.id));
    const after = await getOrderView(order.id, { orderStore, deliveryStatus });
    expect(after).toEqual({
      id: order.id,
      email: order.email,
      status: "paid",
      shippingTier: "standard",
      confirmationDelivered: true,
    });
  });

  it("fails when the order does not exist", async () => {
    await expect(
      getOrderView("missing", {
        orderStore: new InMemoryOrderStore(),
        deliveryStatus: new InMemoryDeliveryStatusLookup(),
      }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
