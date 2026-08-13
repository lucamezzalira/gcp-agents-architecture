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
