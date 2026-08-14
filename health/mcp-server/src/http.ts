import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export type HttpListenOptions = {
  port: number;
  host?: string;
  createServer: () => McpServer;
};

function pathOf(req: IncomingMessage): string {
  return (req.url ?? "/").split("?")[0] ?? "/";
}

function isHealth(req: IncomingMessage): boolean {
  const path = pathOf(req);
  return req.method === "GET" && (path === "/" || path === "/health");
}

function isMcp(req: IncomingMessage): boolean {
  return pathOf(req) === "/mcp";
}

function setCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Mcp-Session-Id, Last-Event-ID, mcp-protocol-version",
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, mcp-protocol-version");
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
  setCors(res);
  if (req.method === "OPTIONS" && isMcp(req)) {
    res.writeHead(204).end();
    return;
  }
  if (isHealth(req)) {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  if (!isMcp(req)) {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    return;
  }
  const mcp = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcp.connect(transport);
  await transport.handleRequest(req, res);
}
