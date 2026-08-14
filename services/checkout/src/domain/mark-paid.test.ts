import { describe, expect, it } from "vitest";
import { InMemoryBodyStore } from "../infrastructure/in-memory-body-store.js";
import { InMemoryInstructionPublisher } from "../infrastructure/in-memory-instruction-publisher.js";
import { InMemoryOrderStore } from "../infrastructure/in-memory-order-store.js";
import { silentLogger } from "./ports/logger.js";
import { markPaid } from "./mark-paid.js";
import { InvalidTransitionError } from "./invalid-transition.js";
import { OrderNotFoundError } from "./order-not-found.js";
import type { Order } from "./order.js";
import { confirmationBodyRef } from "./render-confirmation.js";

const order: Order = {
  id: "ord-1",
  email: "buyer@example.com",
  status: "pending",
  shippingTier: "standard",
};

function setup(): {
  orderStore: InMemoryOrderStore;
  bodyStore: InMemoryBodyStore;
  publisher: InMemoryInstructionPublisher;
  logger: ReturnType<typeof silentLogger>;
} {
  return {
    orderStore: new InMemoryOrderStore(),
    bodyStore: new InMemoryBodyStore(),
    publisher: new InMemoryInstructionPublisher(),
    logger: silentLogger(),
  };
}

describe("markPaid", () => {
  it("renders, stores HTML, and publishes an instruction whose bodyRef resolves", async () => {
    const deps = setup();
    await deps.orderStore.save(order);

    const result = await markPaid(order.id, deps);

    expect(result.status).toBe("paid");
    expect(result.instruction.to).toBe(order.email);
    expect(result.instruction.bodyRef).toBe(confirmationBodyRef(order.id));
    expect(deps.publisher.published).toEqual([result.instruction]);

    const stored = await deps.bodyStore.get(result.instruction.bodyRef);
    expect(stored).toBeDefined();
    expect(stored).toContain("48 hours");
    expect(stored).toContain(order.id);
  });

  it("publishes an expedited confirmation with a 24 hour window", async () => {
    const deps = setup();
    await deps.orderStore.save({ ...order, shippingTier: "expedited" });

    const result = await markPaid(order.id, deps);

    expect(result.status).toBe("paid");
    expect(deps.publisher.published).toHaveLength(1);
    const stored = await deps.bodyStore.get(result.instruction.bodyRef);
    expect(stored).toContain("24 hours");
    expect(stored).not.toContain("48 hours");
  });

  it("does not publish again when the order is already paid", async () => {
    const deps = setup();
    await deps.orderStore.save(order);
    await markPaid(order.id, deps);

    await expect(markPaid(order.id, deps)).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
    expect(deps.publisher.published).toHaveLength(1);
    expect((await deps.orderStore.get(order.id))?.status).toBe("paid");
  });

  it("does not mark a cancelled order paid or publish a send instruction", async () => {
    const deps = setup();
    await deps.orderStore.save({ ...order, status: "cancelled" });

    await expect(markPaid(order.id, deps)).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
    expect(deps.publisher.published).toHaveLength(0);
    expect((await deps.orderStore.get(order.id))?.status).toBe("cancelled");
  });

  it("fails when the order does not exist", async () => {
    const deps = setup();
    await expect(markPaid("missing", deps)).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
    expect(deps.publisher.published).toHaveLength(0);
  });
});
