import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export type HttpListenOptions = {
  port: number;
  host?: string;
  createServer: () => McpServer;
};

function isHealth(req: IncomingMessage): boolean {
  const url = req.url ?? "/";
  const path = url.split("?")[0];
  return req.method === "GET" && (path === "/" || path === "/health");
}

export function listenHttp(options: HttpListenOptions): Promise<Server> {
  const server = createServer((req, res) => {
    void handle(req, res, options.createServer);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host ?? "0.0.0.0", () => {
      resolve(server);
    });
  });
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  createServer: () => McpServer,
): Promise<void> {
  if (isHealth(req)) {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  const mcp = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcp.connect(transport);
  await transport.handleRequest(req, res);
}
