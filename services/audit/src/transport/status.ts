import type { FastifyInstance } from "fastify";

export function mountStatus(app: FastifyInstance): void {
  app.get("/health", async () => ({ ok: true, name: "audit" }));
}
