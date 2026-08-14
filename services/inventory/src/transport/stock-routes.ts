import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Logger } from "@observability/runtime";
import type { StockStore } from "../domain/ports/stock-store.js";
import { getStock, putStock } from "../domain/stock-ops.js";

const skuParams = z.object({ sku: z.string().min(1) });

export function registerStockRoutes(
  app: FastifyInstance,
  store: StockStore,
  logger: Logger,
): void {
  app.get("/stock/:sku", async (request, reply) => {
    const parsed = skuParams.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid sku" });
    }
    const level = await getStock(parsed.data.sku, store);
    if (level === undefined) {
      logger.withCorrelation(parsed.data.sku).warn("stock.missing");
      return reply.code(404).send({ error: "sku not found" });
    }
    return reply.code(200).send(level);
  });

  app.put("/stock/:sku", async (request, reply) => {
    const parsed = skuParams.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid sku" });
    }
    const body =
      typeof request.body === "object" && request.body !== null
        ? { sku: parsed.data.sku, ...request.body }
        : { sku: parsed.data.sku };
    const saved = await putStock(body, store);
    if (saved === undefined) {
      logger.withCorrelation(parsed.data.sku).warn("stock.invalid");
      return reply.code(400).send({ error: "invalid stock" });
    }
    logger.withCorrelation(parsed.data.sku).info("stock.saved", {
      available: saved.available,
    });
    return reply.code(200).send(saved);
  });
}
