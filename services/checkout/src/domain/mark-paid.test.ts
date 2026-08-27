import { describe, expect, it } from "vitest";
import { InMemoryBodyStore } from "../infrastructure/in-memory-body-store.js";
import { InMemoryInstructionPublisher } from "../infrastructure/in-memory-instruction-publisher.js";
import { MemoryReservationOutcomes } from "../infrastructure/memory-reservation-outcomes.js";
import { MemoryReservationPublisher } from "../infrastructure/memory-reservation-publisher.js";
import { InMemoryOrderStore } from "../infrastructure/in-memory-order-store.js";
import { silentLogger } from "@observability/runtime";
import { markPaid } from "./mark-paid.js";
import { InvalidTransitionError } from "./invalid-transition.js";
import { OrderNotFoundError } from "./order-not-found.js";
import { ReservationNotReadyError } from "./reservation-not-ready.js";
import type { Order } from "./order.js";
import { confirmationBodyRef } from "./render-confirmation.js";

const order: Order = {
  id: "ord-1",
  email: "buyer@example.com",
  status: "pending",
  shippingTier: "standard",
};

function setup(autoReserve = true): {
  orderStore: InMemoryOrderStore;
  bodyStore: InMemoryBodyStore;
  publisher: InMemoryInstructionPublisher;
  reservations: MemoryReservationPublisher;
  reservationOutcomes: MemoryReservationOutcomes;
  logger: ReturnType<typeof silentLogger>;
} {
  const reservationOutcomes = new MemoryReservationOutcomes();
  const reservations = new MemoryReservationPublisher(
    autoReserve ? reservationOutcomes : undefined,
  );
  return {
    orderStore: new InMemoryOrderStore(),
    bodyStore: new InMemoryBodyStore(),
    publisher: new InMemoryInstructionPublisher(),
    reservations,
    reservationOutcomes,
    logger: silentLogger(),
  };
}

describe("markPaid", () => {
  it("renders, stores HTML, and publishes an instruction whose bodyRef resolves", async () => {
    const deps = setup();
    await deps.orderStore.save(order);
    await deps.reservations.publish({
      action: "reserve",
      orderId: order.id,
      sku: "standard-item",
      units: 1,
      order: {
        id: order.id,
        email: order.email,
        status: "pending",
        shippingTier: "standard",
        lineItems: [{ sku: "standard-item", units: 1, name: "Standard item" }],
      },
    });

    const result = await markPaid(order.id, deps);

    expect(result.status).toBe("paid");
    expect(result.instruction.to).toBe(order.email);
    expect(result.instruction.bodyRef).toBe(confirmationBodyRef(order.id));
    expect(deps.publisher.published).toEqual([result.instruction]);
    expect(deps.reservations.published.at(-1)).toMatchObject({
      action: "confirm",
      orderId: order.id,
    });

    const stored = await deps.bodyStore.get(result.instruction.bodyRef);
    expect(stored).toBeDefined();
    expect(stored).toContain("48 hours");
    expect(stored).toContain(order.id);
  });

  it("publishes an expedited confirmation with a 24 hour window", async () => {
    const deps = setup();
    await deps.orderStore.save({ ...order, shippingTier: "expedited" });
    await deps.reservationOutcomes.record({
      orderId: order.id,
      result: "reserved",
      sku: "standard-item",
      units: 1,
    });

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
    await deps.reservationOutcomes.record({
      orderId: order.id,
      result: "reserved",
      sku: "standard-item",
      units: 1,
    });
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
    await deps.reservationOutcomes.record({
      orderId: order.id,
      result: "reserved",
      sku: "standard-item",
      units: 1,
    });

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

  it("refuses to pay when no reservation outcome is recorded", async () => {
    const deps = setup(false);
    await deps.orderStore.save(order);

    await expect(markPaid(order.id, deps)).rejects.toBeInstanceOf(
      ReservationNotReadyError,
    );
    expect(deps.publisher.published).toHaveLength(0);
    expect((await deps.orderStore.get(order.id))?.status).toBe("pending");
  });
});
