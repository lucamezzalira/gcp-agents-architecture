import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

const instruction = {
  messageId: "msg-1",
  to: "buyer@example.com",
  subject: "Your order",
  bodyRef: "bodies/order-1.html",
};

describe("POST /pubsub", () => {
  it("acks a wrapped send instruction", async () => {
    const app = createApp();
    app.bodyStore.put(instruction.bodyRef, "<p>ok</p>");
    const response = await app.server.inject({
      method: "POST",
      url: "/pubsub",
      payload: {
        message: {
          data: Buffer.from(JSON.stringify(instruction)).toString("base64"),
        },
      },
    });
    expect(response.statusCode).toBe(204);
    expect(app.emailProvider.calls).toHaveLength(1);
    await app.server.close();
  });

  it("rejects an envelope without message data", async () => {
    const app = createApp();
    const response = await app.server.inject({
      method: "POST",
      url: "/pubsub",
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    await app.server.close();
  });
});
