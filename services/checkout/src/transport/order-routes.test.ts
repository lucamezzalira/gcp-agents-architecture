import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, type CheckoutApp } from "../app.js";
import { confirmationMessageId } from "../domain/get-order-view.js";
import { confirmationBodyRef } from "../domain/render-confirmation.js";

describe("checkout HTTP", () => {
  let app: CheckoutApp;

  beforeEach(() => {
    app = createApp();
  });

  afterEach(async () => {
    await app.server.close();
  });

  it("describes the API at GET /", async () => {
    const response = await app.server.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      service: "checkout",
      health: "/health",
    });
  });

  it("returns 400 when create payload is invalid", async () => {
    const response = await app.server.inject({
      method: "POST",
      url: "/orders",
      payload: { email: "buyer@example.com" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("pays an order and publishes a bodyRef that resolves", async () => {
    const created = await app.server.inject({
      method: "POST",
      url: "/orders",
      payload: { id: "ord-1", email: "buyer@example.com" },
    });
    expect(created.statusCode).toBe(201);
    expect(app.stockReservations.published).toEqual([
      {
        action: "reserve",
        orderId: "ord-1",
        sku: "standard-item",
        units: 1,
        order: {
          id: "ord-1",
          email: "buyer@example.com",
          status: "pending",
          shippingTier: "standard",
          lineItems: [
            { sku: "standard-item", units: 1, name: "Standard item" },
          ],
        },
      },
    ]);

    const paid = await app.server.inject({
      method: "POST",
      url: "/orders/ord-1/pay",
    });
    expect(paid.statusCode).toBe(200);
    expect(paid.json()).toMatchObject({ status: "paid" });
    expect(app.stockReservations.published.at(-1)?.action).toBe("confirm");

    const bodyRef = confirmationBodyRef("ord-1");
    expect(app.publisher.published).toHaveLength(1);
    expect(app.publisher.published[0]?.bodyRef).toBe(bodyRef);
    expect(await app.bodyStore.get(bodyRef)).toContain("48 hours");
  });

  it("pays expedited orders with a 24 hour confirmation published as a send instruction", async () => {
    const created = await app.server.inject({
      method: "POST",
      url: "/orders",
      payload: {
        id: "ord-exp",
        email: "buyer@example.com",
        shippingTier: "expedited",
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ shippingTier: "expedited" });

    const paid = await app.server.inject({
      method: "POST",
      url: "/orders/ord-exp/pay",
    });
    expect(paid.statusCode).toBe(200);
    expect(paid.json()).toMatchObject({ status: "paid" });
    expect(app.publisher.published).toHaveLength(1);
    expect(await app.bodyStore.get(app.publisher.published[0]?.bodyRef ?? "")).toContain(
      "24 hours",
    );
  });

  it("returns 409 when paying an already-paid order", async () => {
    await app.server.inject({
      method: "POST",
      url: "/orders",
      payload: { id: "ord-1", email: "buyer@example.com" },
    });
    await app.server.inject({
      method: "POST",
      url: "/orders/ord-1/pay",
    });

    const second = await app.server.inject({
      method: "POST",
      url: "/orders/ord-1/pay",
    });
    expect(second.statusCode).toBe(409);
    expect(app.publisher.published).toHaveLength(1);
  });

  it("returns 404 when paying a missing order", async () => {
    const response = await app.server.inject({
      method: "POST",
      url: "/orders/missing/pay",
    });
    expect(response.statusCode).toBe(404);
    expect(app.publisher.published).toHaveLength(0);
  });

  it("shows whether the confirmation email was delivered", async () => {
    await app.server.inject({
      method: "POST",
      url: "/orders",
      payload: { id: "ord-1", email: "buyer@example.com" },
    });
    await app.server.inject({
      method: "POST",
      url: "/orders/ord-1/pay",
    });

    const before = await app.server.inject({
      method: "GET",
      url: "/orders/ord-1",
    });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toMatchObject({
      id: "ord-1",
      status: "paid",
      confirmationDelivered: false,
    });

    app.deliveryStatus.markDelivered(confirmationMessageId("ord-1"));
    const after = await app.server.inject({
      method: "GET",
      url: "/orders/ord-1",
    });
    expect(after.json()).toMatchObject({ confirmationDelivered: true });
  });

  it("returns 404 when viewing a missing order", async () => {
    const response = await app.server.inject({
      method: "GET",
      url: "/orders/missing",
    });
    expect(response.statusCode).toBe(404);
  });

  it("cancels a pending order and publishes release", async () => {
    await app.server.inject({
      method: "POST",
      url: "/orders",
      payload: { id: "ord-c", email: "buyer@example.com" },
    });
    const cancelled = await app.server.inject({
      method: "POST",
      url: "/orders/ord-c/cancel",
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toEqual({ status: "cancelled" });
    expect(app.stockReservations.published.at(-1)?.action).toBe("release");
  });

  it("records a reservation outcome from the push envelope", async () => {
    const outcome = {
      orderId: "ord-1",
      result: "reserved",
      sku: "standard-item",
      units: 1,
    };
    const response = await app.server.inject({
      method: "POST",
      url: "/reservation-outcomes",
      payload: {
        message: {
          data: Buffer.from(JSON.stringify(outcome)).toString("base64"),
        },
      },
    });
    expect(response.statusCode).toBe(204);
    expect(app.stockOutcomes.recorded).toEqual([outcome]);
  });
});
