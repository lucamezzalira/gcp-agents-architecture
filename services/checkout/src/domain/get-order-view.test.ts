import { describe, expect, it } from "vitest";
import { InMemoryOrderStore } from "../infrastructure/in-memory-order-store.js";
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
  it("returns the order fields checkout owns", async () => {
    const orderStore = new InMemoryOrderStore();
    await orderStore.save(order);

    const view = await getOrderView(order.id, { orderStore });
    expect(view).toEqual({
      id: order.id,
      email: order.email,
      status: "paid",
      shippingTier: "standard",
    });
  });

  it("fails when the order does not exist", async () => {
    await expect(
      getOrderView("missing", {
        orderStore: new InMemoryOrderStore(),
      }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
