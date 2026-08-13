import { describe, expect, it } from "vitest";
import { InMemoryHealthStore } from "./memory-store.js";
import { listenHttp } from "./http.js";
import { createMcpServer } from "./server.js";

describe("MCP HTTP", () => {
  it("answers GET /health", async () => {
    const store = new InMemoryHealthStore();
    const server = await listenHttp({
      port: 0,
      host: "127.0.0.1",
      createServer: () => createMcpServer(store),
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected a TCP address");
    }
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");

    const initialize = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        },
      }),
    });
    expect(initialize.status).toBe(200);
    const body = await initialize.text();
    expect(body).toContain("architecture-health");
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });
});
