import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, type InventoryApp } from "../app.js";

describe("inventory HTTP", () => {
  let app: InventoryApp;

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
      service: "inventory",
      health: "/health",
    });
  });

  it("stores and returns stock for a sku", async () => {
    const put = await app.server.inject({
      method: "PUT",
      url: "/stock/standard-item",
      payload: { available: 12 },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ sku: "standard-item", available: 12 });

    const get = await app.server.inject({
      method: "GET",
      url: "/stock/standard-item",
    });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toEqual({ sku: "standard-item", available: 12 });
  });

  it("reserves through the pubsub push envelope", async () => {
    await app.server.inject({
      method: "PUT",
      url: "/stock/standard-item",
      payload: { available: 10 },
    });
    const command = {
      action: "reserve",
      orderId: "ord-push",
      sku: "standard-item",
      units: 2,
    };
    const response = await app.server.inject({
      method: "POST",
      url: "/pubsub",
      payload: {
        message: {
          data: Buffer.from(JSON.stringify(command)).toString("base64"),
        },
      },
    });
    expect(response.statusCode).toBe(204);
    expect((await app.stock.get("standard-item"))?.available).toBe(8);
    expect(app.outcomes.published[0]?.result).toBe("reserved");
  });
});
