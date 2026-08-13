import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getHealth,
  getPriorDecisions,
  listCharacteristics,
  listHealthRuns,
} from "./tools.js";
import type { HealthStore } from "./types.js";

function asText(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

export function createMcpServer(store: HealthStore): McpServer {
  const server = new McpServer({
    name: "architecture-health",
    version: "0.1.0",
  });

  server.tool(
    "get_health",
    "Architecture health for a path or service: overall score, reasoning, recommendations. Defaults to the latest run.",
    {
      path: z
        .string()
        .optional()
        .describe(
          "File or service path, e.g. services/checkout. Omit for the full run.",
        ),
      commitSha: z
        .string()
        .optional()
        .describe("Commit SHA to inspect. Omit for the latest run."),
    },
    async ({ path, commitSha }) => asText(await getHealth(store, { path, commitSha })),
  );

  server.tool(
    "list_health_runs",
    "Chronological health runs with overall and per-characteristic scores. Use this to see the architecture trend across commits.",
    async () => asText(await listHealthRuns(store)),
  );

  server.tool(
    "get_prior_decisions",
    "Active accepted decisions that match a path. Inactive decisions are omitted.",
    {
      path: z
        .string()
        .describe("File or service path to match against decision path globs."),
    },
    async ({ path }) => asText(await getPriorDecisions(store, path)),
  );

  server.tool(
    "list_characteristics",
    "Characteristics the health system tracks.",
    async () => asText(listCharacteristics()),
  );

  return server;
}
