import { describe, expect, it } from "vitest";
import { runtimeCallGraphSchema } from "@health/scoring/schemas";
import {
  buildRuntimePayload,
  diffAgainstImports,
  edgesFromSpans,
  importServiceEdges,
  queryCloudTraces,
} from "./runtime-graph.js";

const importModules = [
  {
    source: "services/checkout/src/app.ts",
    dependencies: [
      { resolved: "services/notification/src/domain/deliver.ts" },
    ],
  },
];

describe("runtime call graph vs imports", () => {
  it("finds a runtime HTTP edge that static analysis cannot see", () => {
    const imports = importServiceEdges(
      [
        {
          source: "services/checkout/src/infrastructure/http-stock-lookup.ts",
          dependencies: [
            { resolved: "services/checkout/src/domain/ports/stock-lookup.ts" },
          ],
        },
      ],
      (file) => file,
    );
    expect(imports).toEqual([]);

    const runtime = edgesFromSpans([
      {
        spans: [
          {
            spanId: "1",
            labels: {
              "ga.service": "checkout",
              "ga.peer": "inventory",
              "ga.protocol": "http",
              "ga.kind": "client",
            },
          },
          {
            spanId: "2",
            parentSpanId: "1",
            labels: {
              "ga.service": "inventory",
              "ga.peer": "checkout",
              "ga.protocol": "http",
              "ga.kind": "server",
            },
          },
        ],
      },
    ]);
    expect(runtime).toEqual([
      {
        from: "checkout",
        to: "inventory",
        protocol: "http",
        count: 3,
      },
    ]);

    const diff = diffAgainstImports(runtime, imports);
    expect(diff.runtimeOnly).toEqual([
      { from: "checkout", to: "inventory", protocol: "http" },
    ]);
    expect(diff.importOnly).toEqual([]);
  });

  it("flags an import with no runtime edge as dead coupling", () => {
    const imports = importServiceEdges(
      [
        {
          source: "services/checkout/src/app.ts",
          dependencies: [
            { resolved: "services/notification/src/domain/deliver.ts" },
          ],
        },
      ],
      (file) => file,
    );
    const diff = diffAgainstImports([], imports);
    expect(diff.importOnly).toEqual([
      { from: "checkout", to: "notification" },
    ]);
    expect(diff.runtimeOnly).toEqual([]);
  });

  it("omits edges when Cloud Trace was not reached", async () => {
    const runtime = await buildRuntimePayload({
      modules: importModules,
      relativize: (file) => file,
      queried: false,
      traffic: "none",
      now: new Date("2026-01-01T00:30:00.000Z"),
      windowStart: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(runtime.callGraph.queried).toBe(false);
    expect(runtime.callGraph.edges).toBeUndefined();
    expect(runtime.callGraph.traffic).toBe("none");
    expect(runtime.callGraph.window).toEqual({
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-01-01T00:30:00.000Z",
    });
    expect(runtime.vsImports).toEqual({ runtimeOnly: [], importOnly: [] });
    expect(runtimeCallGraphSchema.parse(runtime.callGraph).edges).toBeUndefined();
    expect(
      runtime.signals.filter((item) => item.name === "p95-latency" || item.name === "error-rate"),
    ).toEqual([
      { name: "p95-latency", value: 120, unit: "ms", illustrative: true },
      { name: "error-rate", value: 0.01, unit: "ratio", illustrative: true },
    ]);
  });

  it("keeps an empty edges array when a query succeeded and found nothing", async () => {
    const runtime = await buildRuntimePayload({
      modules: importModules,
      relativize: (file) => file,
      traces: [],
      queried: true,
      traffic: "this-run",
    });
    expect(runtime.callGraph.queried).toBe(true);
    expect(runtime.callGraph.edges).toEqual([]);
    expect(runtime.callGraph.traffic).toBe("this-run");
    expect(runtime.vsImports.importOnly).toEqual([
      { from: "checkout", to: "notification" },
    ]);
  });

  it("records this-run traffic and the supplied window", async () => {
    const runtime = await buildRuntimePayload({
      modules: [],
      relativize: (file) => file,
      traces: [
        {
          spans: [
            {
              spanId: "1",
              labels: {
                "ga.service": "checkout",
                "ga.peer": "inventory",
                "ga.protocol": "http",
                "ga.kind": "client",
              },
            },
          ],
        },
      ],
      queried: true,
      traffic: "this-run",
      now: new Date("2026-08-14T12:00:20.000Z"),
      windowStart: new Date("2026-08-14T12:00:00.000Z"),
    });
    expect(runtime.callGraph.traffic).toBe("this-run");
    expect(runtime.callGraph.window.start).toBe("2026-08-14T12:00:00.000Z");
    expect(runtime.callGraph.window.end).toBe("2026-08-14T12:00:20.000Z");
    expect(runtime.vsImports.runtimeOnly).toEqual([
      { from: "checkout", to: "inventory", protocol: "http" },
    ]);
  });
});

describe("Cloud Trace query failures", () => {
  it("returns queried false when the API rejects the request", async () => {
    const result = await queryCloudTraces({
      projectId: "ga-services-mezzalab",
      start: new Date("2026-01-01T00:00:00.000Z"),
      end: new Date("2026-01-01T00:30:00.000Z"),
      token: "not-a-token",
      fetchImpl: async () =>
        new Response("forbidden", { status: 403 }) as Response,
    });
    expect(result).toEqual({ traces: [], queried: false });
  });
});

describe("call graph schema", () => {
  it("rejects a failed query that presents an empty graph", () => {
    const parsed = runtimeCallGraphSchema.safeParse({
      illustrative: false,
      synthetic: true,
      description: "synthetic",
      window: {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-01T00:30:00.000Z",
      },
      traffic: "none",
      queried: false,
      edges: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a successful query with no edges", () => {
    const parsed = runtimeCallGraphSchema.parse({
      illustrative: false,
      synthetic: true,
      description: "synthetic",
      window: {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-01T00:30:00.000Z",
      },
      traffic: "this-run",
      queried: true,
      edges: [],
    });
    expect(parsed.edges).toEqual([]);
  });
});
