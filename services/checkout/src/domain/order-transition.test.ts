import { describe, expect, it } from "vitest";
import { InvalidTransitionError } from "./invalid-transition.js";
import type { Order, OrderStatus } from "./order.js";
import { applyTransition, canTransition } from "./order-transition.js";

const statuses: OrderStatus[] = ["pending", "paid", "cancelled"];

const permitted: Array<[OrderStatus, OrderStatus]> = [
  ["pending", "paid"],
  ["pending", "cancelled"],
];

function orderAt(status: OrderStatus): Order {
  return {
    id: "ord-1",
    email: "buyer@example.com",
    status,
  };
}

describe("order transitions", () => {
  it.each(permitted)("allows %s -> %s", (from, to) => {
    const next = applyTransition(orderAt(from), to);
    expect(next.status).toBe(to);
    expect(next.id).toBe("ord-1");
  });

  it.each(
    statuses.flatMap((from) =>
      statuses
        .filter((to) => !canTransition(from, to))
        .map((to) => [from, to] as const),
    ),
  )("rejects %s -> %s", (from, to) => {
    const original = orderAt(from);
    expect(() => applyTransition(original, to)).toThrow(InvalidTransitionError);
    expect(original.status).toBe(from);
  });
});
