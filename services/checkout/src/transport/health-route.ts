import type { FastifyInstance } from "fastify";

export function registerHealthRoute(app: FastifyInstance): void {
  app.get("/", async () => ({
    service: "checkout",
    health: "/health",
    createOrder: { method: "POST", path: "/orders" },
    payOrder: { method: "POST", path: "/orders/:id/pay" },
  }));
  app.get("/health", async () => ({ status: "ok" }));
}
