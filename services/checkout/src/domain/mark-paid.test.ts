import { describe, expect, it } from "vitest";
import { InMemoryBodyStore } from "../infrastructure/in-memory-body-store.js";
import { InMemoryInstructionPublisher } from "../infrastructure/in-memory-instruction-publisher.js";
import { InMemoryOrderStore } from "../infrastructure/in-memory-order-store.js";
import { markPaid } from "./mark-paid.js";
import { OrderNotFoundError } from "./order-not-found.js";
import type { Order } from "./order.js";
import { confirmationBodyRef } from "./render-confirmation.js";

const order: Order = {
  id: "ord-1",
  email: "buyer@example.com",
  status: "pending",
};

function setup(): {
  orderStore: InMemoryOrderStore;
  bodyStore: InMemoryBodyStore;
  publisher: InMemoryInstructionPublisher;
} {
  return {
    orderStore: new InMemoryOrderStore(),
    bodyStore: new InMemoryBodyStore(),
    publisher: new InMemoryInstructionPublisher(),
  };
}

describe("markPaid", () => {
  it("renders, stores HTML, and publishes an instruction whose bodyRef resolves", async () => {
    const deps = setup();
    await deps.orderStore.save(order);

    const result = await markPaid(order.id, deps);

    expect(result.status).toBe("paid");
    if (result.status !== "paid") {
      return;
    }
    expect(result.instruction.to).toBe(order.email);
    expect(result.instruction.bodyRef).toBe(confirmationBodyRef(order.id));
    expect(deps.publisher.published).toEqual([result.instruction]);

    const stored = await deps.bodyStore.get(result.instruction.bodyRef);
    expect(stored).toBeDefined();
    expect(stored).toContain("48 hours");
    expect(stored).toContain(order.id);
  });

  it("does not publish again when the order is already paid", async () => {
    const deps = setup();
    await deps.orderStore.save(order);
    await markPaid(order.id, deps);

    const second = await markPaid(order.id, deps);

    expect(second).toEqual({ status: "already-paid" });
    expect(deps.publisher.published).toHaveLength(1);
  });

  it("fails when the order does not exist", async () => {
    const deps = setup();
    await expect(markPaid("missing", deps)).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
    expect(deps.publisher.published).toHaveLength(0);
  });
});
