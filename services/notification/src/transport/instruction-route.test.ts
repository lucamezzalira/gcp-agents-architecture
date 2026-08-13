import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, type NotificationApp } from "../app.js";

const instruction = {
  messageId: "msg-1",
  to: "buyer@example.com",
  subject: "Your order",
  bodyRef: "bodies/order-1.html",
};

describe("POST /instructions", () => {
  let app: NotificationApp;

  beforeEach(() => {
    app = createApp();
  });

  afterEach(async () => {
    await app.server.close();
  });

  it("returns 400 when the body is not a valid instruction", async () => {
    const response = await app.server.inject({
      method: "POST",
      url: "/instructions",
      payload: { to: "buyer@example.com" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("returns 404 when the bodyRef object is missing", async () => {
    const response = await app.server.inject({
      method: "POST",
      url: "/instructions",
      payload: instruction,
    });
    expect(response.statusCode).toBe(404);
    expect(app.emailProvider.calls).toHaveLength(0);
  });

  it("returns 200 and sends once for a stored body", async () => {
    app.bodyStore.put(instruction.bodyRef, "<p>ok</p>");
    const response = await app.server.inject({
      method: "POST",
      url: "/instructions",
      payload: instruction,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "sent" });
    expect(app.emailProvider.calls).toHaveLength(1);
  });
});
