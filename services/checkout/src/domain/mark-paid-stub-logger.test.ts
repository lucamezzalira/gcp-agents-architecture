import { describe, expect, it } from "vitest";
import type { BodyStore } from "./ports/body-store.js";
import type { InstructionPublisher } from "./ports/instruction-publisher.js";
import type { CorrelatedLogger, Logger } from "./ports/logger.js";
import { markPaid } from "./mark-paid.js";
import type { Order } from "./order.js";
import { OrderNotFoundError } from "./order-not-found.js";
import type { OrderStore } from "./ports/order-store.js";
import type { SendInstruction } from "./send-instruction.js";
import type { StockLookup } from "./ports/stock-lookup.js";
import type { StockCommand } from "./stock-command.js";

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

  async list(): Promise<Order[]> {
    return this.stored === undefined ? [] : [this.stored];
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

class MemoryStockPublisher implements StockReservationPublisher {
  async publish(_command: StockCommand): Promise<void> {}
}

class PlentyStock implements StockLookup {
  async available(): Promise<number> {
    return 99;
  }
}

describe("markPaid with a stub logger", () => {
  it("runs without an infrastructure logger", async () => {
    const publisher = new MemoryPublisher();
    const result = await markPaid(order.id, {
      orderStore: new MemoryOrderStore(order),
      bodyStore: new MemoryBodyStore(),
      publisher,
      stockReservations: new MemoryStockPublisher(),
      stockLookup: new PlentyStock(),
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
        stockReservations: new MemoryStockPublisher(),
        stockLookup: new PlentyStock(),
        logger: new StubLogger(),
      }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
