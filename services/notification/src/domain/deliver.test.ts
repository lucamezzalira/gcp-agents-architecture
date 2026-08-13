import { describe, expect, it } from "vitest";
import { InMemoryBodyStore } from "../infrastructure/in-memory-body-store.js";
import { InMemoryDeliveryStore } from "../infrastructure/in-memory-delivery-store.js";
import { InMemoryEmailProvider } from "../infrastructure/in-memory-email-provider.js";
import { BodyNotFoundError } from "./body-not-found.js";
import { deliver } from "./deliver.js";
import type { SendInstruction } from "./send-instruction.js";

const instruction: SendInstruction = {
  messageId: "msg-1",
  to: "buyer@example.com",
  subject: "Your order",
  bodyRef: "bodies/order-1.html",
};

const storedBody = "<p>ships within 48 hours</p>";

function setup(): {
  bodyStore: InMemoryBodyStore;
  deliveryStore: InMemoryDeliveryStore;
  emailProvider: InMemoryEmailProvider;
} {
  return {
    bodyStore: new InMemoryBodyStore(),
    deliveryStore: new InMemoryDeliveryStore(),
    emailProvider: new InMemoryEmailProvider(),
  };
}

describe("deliver", () => {
  it("sends exactly once for a valid instruction", async () => {
    const deps = setup();
    deps.bodyStore.put(instruction.bodyRef, storedBody);

    const result = await deliver(instruction, deps);

    expect(result).toEqual({ status: "sent" });
    expect(deps.emailProvider.calls).toHaveLength(1);
    expect(deps.emailProvider.calls[0]).toEqual({
      to: instruction.to,
      subject: instruction.subject,
      html: storedBody,
    });
  });

  it("does not call the provider again for the same messageId", async () => {
    const deps = setup();
    deps.bodyStore.put(instruction.bodyRef, storedBody);

    await deliver(instruction, deps);
    const second = await deliver(instruction, deps);

    expect(second).toEqual({ status: "duplicate" });
    expect(deps.emailProvider.calls).toHaveLength(1);
  });

  it("fails without calling the provider when the body is missing", async () => {
    const deps = setup();

    await expect(deliver(instruction, deps)).rejects.toBeInstanceOf(
      BodyNotFoundError,
    );
    expect(deps.emailProvider.calls).toHaveLength(0);
    expect(await deps.deliveryStore.hasBeenDelivered(instruction.messageId)).toBe(
      false,
    );
  });
});
