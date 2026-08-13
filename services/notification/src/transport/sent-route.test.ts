import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("GET /sent", () => {
  it("lists provider calls after a successful instruction", async () => {
    const app = createApp();
    app.bodyStore.put("bodies/order-1.html", "<p>ok</p>");
    await app.server.inject({
      method: "POST",
      url: "/instructions",
      payload: {
        messageId: "msg-1",
        to: "buyer@example.com",
        subject: "Your order",
        bodyRef: "bodies/order-1.html",
      },
    });
    const response = await app.server.inject({ method: "GET", url: "/sent" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      sent: [
        {
          to: "buyer@example.com",
          subject: "Your order",
          html: "<p>ok</p>",
        },
      ],
    });
    await app.server.close();
  });
});
