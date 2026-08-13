import { listenHttp } from "./http.js";
import { createPostgresStore } from "./postgres-store.js";
import { createMcpServer } from "./server.js";

const store = createPostgresStore();
const port = Number(process.env.PORT ?? "8080");
await listenHttp({
  port,
  createServer: () => createMcpServer(store),
});
console.error(`mcp http listening on ${port}`);
