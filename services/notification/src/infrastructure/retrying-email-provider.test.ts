import { describe, expect, it } from "vitest";
import { InMemoryBodyStore } from "./in-memory-body-store.js";
import { InMemoryDeliveryStore } from "./in-memory-delivery-store.js";
import type { EmailMessage, EmailProvider } from "../domain/ports/email-provider.js";
import { deliver } from "../domain/deliver.js";
import { silentLogger } from "../domain/ports/logger.js";
import type { SendInstruction } from "../domain/ports/instruction-publisher.js";
import { ProviderSendError } from "./provider-send-error.js";
import { RetryingEmailProvider } from "./retrying-email-provider.js";
import type { RetryPolicy } from "./retry-policy.js";

const instruction: SendInstruction = {
  messageId: "msg-1",
  to: "buyer@example.com",
  subject: "Your order",
  bodyRef: "bodies/order-1.html",
};

const storedBody = "<p>ships within 48 hours</p>";

const policy: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 10,
  factor: 2,
  maxDelayMs: 100,
};

class FlakyEmailProvider implements EmailProvider {
  attempts = 0;
  readonly sent: EmailMessage[] = [];

  constructor(private readonly failTimes: number) {}

  async send(message: EmailMessage): Promise<void> {
    this.attempts += 1;
    if (this.attempts <= this.failTimes) {
      throw new Error("transient");
    }
    this.sent.push(message);
  }
}

describe("RetryingEmailProvider", () => {
  it("delivers exactly once after a transient failure", async () => {
    const inner = new FlakyEmailProvider(1);
    const waits: number[] = [];
    const provider = new RetryingEmailProvider(inner, {
      policy,
      wait: async (ms) => {
        waits.push(ms);
      },
    });
    const bodyStore = new InMemoryBodyStore();
    const deliveryStore = new InMemoryDeliveryStore();
    bodyStore.put(instruction.bodyRef, storedBody);

    const result = await deliver(instruction, {
      bodyStore,
      deliveryStore,
      emailProvider: provider,
      logger: silentLogger(),
    });

    expect(result).toEqual({ status: "sent" });
    expect(inner.sent).toHaveLength(1);
    expect(inner.attempts).toBe(2);
    expect(waits).toEqual([10]);
  });

  it("surfaces ProviderSendError and does not record a delivery when attempts are exhausted", async () => {
    const inner = new FlakyEmailProvider(5);
    const provider = new RetryingEmailProvider(inner, {
      policy,
      wait: async () => undefined,
    });
    const bodyStore = new InMemoryBodyStore();
    const deliveryStore = new InMemoryDeliveryStore();
    bodyStore.put(instruction.bodyRef, storedBody);

    await expect(
      deliver(instruction, {
        bodyStore,
        deliveryStore,
        emailProvider: provider,
        logger: silentLogger(),
      }),
    ).rejects.toBeInstanceOf(ProviderSendError);
    expect(inner.sent).toHaveLength(0);
    expect(inner.attempts).toBe(3);
  });

  it("does not retry past the idempotency claim", async () => {
    const inner = new FlakyEmailProvider(0);
    const provider = new RetryingEmailProvider(inner, {
      policy,
      wait: async () => undefined,
    });
    const bodyStore = new InMemoryBodyStore();
    const deliveryStore = new InMemoryDeliveryStore();
    bodyStore.put(instruction.bodyRef, storedBody);

    await deliver(instruction, {
      bodyStore,
      deliveryStore,
      emailProvider: provider,
      logger: silentLogger(),
    });
    const second = await deliver(instruction, {
      bodyStore,
      deliveryStore,
      emailProvider: provider,
      logger: silentLogger(),
    });

    expect(second).toEqual({ status: "duplicate" });
    expect(inner.sent).toHaveLength(1);
    expect(inner.attempts).toBe(1);
  });
});
