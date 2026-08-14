import { describe, expect, it } from "vitest";
import {
  canTransition,
  parseOrderSnapshot,
  skuFromOrder,
  unitsFromOrder,
} from "./order.js";

describe("inventory order snapshot", () => {
  const snapshot = {
    id: "ord-1",
    email: "buyer@example.com",
    status: "pending",
    shippingTier: "standard",
    lineItems: [{ sku: "standard-item", units: 1, name: "Standard item" }],
  };

  it("parses checkout's order shape including email and status", () => {
    const order = parseOrderSnapshot(snapshot);
    expect(order?.email).toBe("buyer@example.com");
    expect(order?.status).toBe("pending");
    expect(skuFromOrder(order!)).toBe("standard-item");
    expect(unitsFromOrder(order!)).toBe(1);
  });

  it("rejects a snapshot without line items", () => {
    expect(
      parseOrderSnapshot({ ...snapshot, lineItems: [] }),
    ).toBeUndefined();
  });

  it("knows checkout's status machine", () => {
    expect(canTransition("pending", "paid")).toBe(true);
    expect(canTransition("paid", "cancelled")).toBe(false);
  });
});
