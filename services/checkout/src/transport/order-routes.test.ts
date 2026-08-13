import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, type CheckoutApp } from "../app.js";
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

    const paid = await app.server.inject({
      method: "POST",
      url: "/orders/ord-1/pay",
    });
    expect(paid.statusCode).toBe(200);
    expect(paid.json()).toMatchObject({ status: "paid" });

    const bodyRef = confirmationBodyRef("ord-1");
    expect(app.publisher.published).toHaveLength(1);
    expect(app.publisher.published[0]?.bodyRef).toBe(bodyRef);
    expect(await app.bodyStore.get(bodyRef)).toContain("48 hours");
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
});
