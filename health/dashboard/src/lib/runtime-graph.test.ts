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
  it("places checkout, inventory, and notification", () => {
    const layout = layoutRuntimeGraph(DESIGNED_RUNTIME_EDGES);
    expect(layout.nodes.map((node) => node.id)).toEqual([
      "checkout",
      "inventory",
      "notification",
    ]);
    expect(layout.links).toHaveLength(DESIGNED_RUNTIME_EDGES.length);
    expect(layout.links.every((link) => link.d.startsWith("M "))).toBe(true);
  });
});
