import type { FastifyInstance } from "fastify";

export function registerHealthRoute(app: FastifyInstance): void {
  app.get("/", async () => ({
    service: "inventory",
    health: "/health",
    getStock: { method: "GET", path: "/stock/:sku" },
    putStock: { method: "PUT", path: "/stock/:sku" },
  }));
  app.get("/health", async () => ({ status: "ok" }));
}
