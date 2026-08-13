import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

const instruction = {
  messageId: "msg-1",
  to: "buyer@example.com",
  subject: "Your order",
  bodyRef: "bodies/order-1.html",
};

describe("GET /metrics", () => {
  it("reports delivery counts, failures and average attempts", async () => {
    const app = createApp();
    app.bodyStore.put(instruction.bodyRef, "<p>ok</p>");
    await app.server.inject({
      method: "POST",
      url: "/instructions",
      payload: instruction,
    });
    await app.server.inject({
      method: "POST",
      url: "/instructions",
      payload: { ...instruction, messageId: "msg-2" },
    });

    const response = await app.server.inject({ method: "GET", url: "/metrics" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      delivered: 2,
      failed: 0,
      averageAttempts: 1,
    });
    await app.server.close();
  });
});
