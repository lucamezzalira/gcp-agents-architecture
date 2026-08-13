import { describe, expect, it } from "vitest";
import type { BodyStore } from "./body-store.js";
import type { InstructionPublisher } from "./instruction-publisher.js";
import type { CorrelatedLogger, Logger } from "./logger.js";
import type { Mailer, MailerMessage } from "./mailer.js";
import { markPaid } from "./mark-paid.js";
import type { Order } from "./order.js";
import { OrderNotFoundError } from "./order-not-found.js";
import type { OrderStore } from "./order-store.js";
import type { SendInstruction } from "./send-instruction.js";

const order: Order = {
  id: "ord-1",
  email: "buyer@example.com",
  status: "pending",
  shippingTier: "standard",
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

class MemoryOrderStore implements OrderStore {
  constructor(private readonly stored: Order | undefined) {}

  async get(): Promise<Order | undefined> {
    return this.stored;
  }

  async save(): Promise<void> {}
}

class MemoryBodyStore implements BodyStore {
  async put(): Promise<void> {}
}

class MemoryPublisher implements InstructionPublisher {
  readonly published: SendInstruction[] = [];

  async publish(instruction: SendInstruction): Promise<void> {
    this.published.push(instruction);
  }
}

class MemoryMailer implements Mailer {
  readonly calls: MailerMessage[] = [];

  async send(message: MailerMessage): Promise<void> {
    this.calls.push(message);
  }
}

describe("markPaid with a stub logger", () => {
  it("runs without an infrastructure logger", async () => {
    const publisher = new MemoryPublisher();
    const result = await markPaid(order.id, {
      orderStore: new MemoryOrderStore(order),
      bodyStore: new MemoryBodyStore(),
      publisher,
      mailer: new MemoryMailer(),
      logger: new StubLogger(),
    });

    expect(result.status).toBe("paid");
    expect(publisher.published).toHaveLength(1);
  });

  it("still fails when the order is missing", async () => {
    await expect(
      markPaid("missing", {
        orderStore: new MemoryOrderStore(undefined),
        bodyStore: new MemoryBodyStore(),
        publisher: new MemoryPublisher(),
        mailer: new MemoryMailer(),
        logger: new StubLogger(),
      }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
