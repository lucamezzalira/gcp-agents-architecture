import type { FastifyInstance } from "fastify";

export function registerHealthRoute(app: FastifyInstance): void {
  app.get("/", async () => ({
    service: "checkout",
    health: "/health",
    getOrder: { method: "GET", path: "/orders/:id" },
    createOrder: { method: "POST", path: "/orders" },
    payOrder: { method: "POST", path: "/orders/:id/pay" },
    cancelOrder: { method: "POST", path: "/orders/:id/cancel" },
  }));
  app.get("/health", async () => ({ status: "ok" }));
}
