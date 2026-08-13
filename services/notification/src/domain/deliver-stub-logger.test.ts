import { describe, expect, it } from "vitest";
import type { BodyStore } from "./body-store.js";
import { BodyNotFoundError } from "./body-not-found.js";
import { deliver } from "./deliver.js";
import type { DeliveryStore } from "./delivery-store.js";
import type { EmailMessage, EmailProvider } from "./email-provider.js";
import type { CorrelatedLogger, Logger } from "./logger.js";
import type { SendInstruction } from "./send-instruction.js";

const instruction: SendInstruction = {
  messageId: "msg-1",
  to: "buyer@example.com",
  subject: "Your order",
  bodyRef: "bodies/order-1.html",
};

class StubLogger implements Logger {
  withCorrelation(): CorrelatedLogger {
    return {
      info() {},
      warn() {},
      error() {},
    };
  }
}

class MemoryBodyStore implements BodyStore {
  constructor(private readonly body: string | undefined) {}

  async get(): Promise<string | undefined> {
    return this.body;
  }
}

class MemoryDeliveryStore implements DeliveryStore {
  async claim(): Promise<boolean> {
    return true;
  }
}

class MemoryEmailProvider implements EmailProvider {
  readonly calls: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.calls.push(message);
  }
}

describe("deliver with a stub logger", () => {
  it("runs without an infrastructure logger", async () => {
    const emailProvider = new MemoryEmailProvider();
    const result = await deliver(instruction, {
      bodyStore: new MemoryBodyStore("<p>ok</p>"),
      deliveryStore: new MemoryDeliveryStore(),
      emailProvider,
      logger: new StubLogger(),
    });

    expect(result).toEqual({ status: "sent" });
    expect(emailProvider.calls).toHaveLength(1);
  });

  it("still fails when the body is missing", async () => {
    await expect(
      deliver(instruction, {
        bodyStore: new MemoryBodyStore(undefined),
        deliveryStore: new MemoryDeliveryStore(),
        emailProvider: new MemoryEmailProvider(),
        logger: new StubLogger(),
      }),
    ).rejects.toBeInstanceOf(BodyNotFoundError);
  });
});
