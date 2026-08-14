import { describe, expect, it } from "vitest";
import {
  DESIGNED_RUNTIME_EDGES,
  layoutRuntimeGraph,
  mergeRuntimeEdges,
} from "./runtime-graph.js";

describe("mergeRuntimeEdges", () => {
  it("keeps designed event channels and attaches observed counts", () => {
    const merged = mergeRuntimeEdges([
      { from: "checkout", to: "notification", protocol: "pubsub", count: 3 },
      { from: "checkout", to: "inventory", protocol: "http", count: 2 },
    ]);
    expect(merged).toHaveLength(DESIGNED_RUNTIME_EDGES.length);
    expect(
      merged.find(
        (edge) =>
          edge.from === "checkout" &&
          edge.to === "notification" &&
          edge.protocol === "pubsub",
      )?.count,
    ).toBe(3);
    expect(
      merged.find(
        (edge) =>
          edge.from === "checkout" &&
          edge.to === "inventory" &&
          edge.protocol === "http",
      )?.count,
    ).toBe(2);
  });
});

describe("layoutRuntimeGraph", () => {
  it("places checkout, inventory, notification, and audit", () => {
    const layout = layoutRuntimeGraph(DESIGNED_RUNTIME_EDGES);
    expect(layout.nodes.map((node) => node.id)).toEqual([
      "checkout",
      "inventory",
      "notification",
      "audit",
    ]);
    expect(layout.links).toHaveLength(DESIGNED_RUNTIME_EDGES.length);
    expect(layout.links.every((link) => link.d.startsWith("M "))).toBe(true);
  });

  it("keeps the paid-email arc and its label above the service boxes", () => {
    const layout = layoutRuntimeGraph(DESIGNED_RUNTIME_EDGES);
    const paid = layout.links.find(
      (link) => link.from === "checkout" && link.to === "notification",
    );
    const inventory = layout.nodes.find((node) => node.id === "inventory");
    expect(paid).toBeDefined();
    expect(inventory).toBeDefined();
    expect(paid?.labelY).toBeLessThan(inventory?.y ?? 0);
    expect(paid?.label).toContain("paid confirmation");
  });

  it("puts reservation traffic above the boxes and outcomes below", () => {
    const layout = layoutRuntimeGraph(DESIGNED_RUNTIME_EDGES);
    const reservations = layout.links.find(
      (link) => link.purpose === "reservations",
    );
    const outcomes = layout.links.find(
      (link) => link.purpose === "reservation outcomes",
    );
    const inventory = layout.nodes.find((node) => node.id === "inventory");
    expect(reservations?.labelY).toBeLessThan(inventory?.y ?? 0);
    expect(outcomes?.labelY).toBeGreaterThan(
      (inventory?.y ?? 0) + (inventory?.height ?? 0),
    );
  });
});
