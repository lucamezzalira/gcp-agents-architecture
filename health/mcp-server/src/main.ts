import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { listenHttp } from "./http.js";
import { createPostgresStore } from "./postgres-store.js";
import { createMcpServer } from "./server.js";

const store = createPostgresStore();

if (process.env.MCP_HTTP === "1") {
  const port = Number(process.env.PORT ?? "8080");
  await listenHttp({
    port,
    createServer: () => createMcpServer(store),
  });
  console.error(`mcp http listening on ${port}`);
} else {
  const server = createMcpServer(store);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
