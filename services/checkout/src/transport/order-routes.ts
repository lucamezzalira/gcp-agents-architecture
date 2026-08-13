import type { FastifyInstance } from "fastify";
import type { Logger } from "../domain/logger.js";
import type { MarkPaidResult } from "../domain/mark-paid.js";
import { OrderNotFoundError } from "../domain/order-not-found.js";
import {
  parseCreateOrder,
  parseOrderIdParams,
  type Order,
} from "../domain/order.js";

export type CreateOrderHandler = (order: Order) => Promise<void>;
export type PayOrderHandler = (orderId: string) => Promise<MarkPaidResult>;

export function registerOrderRoutes(
  app: FastifyInstance,
  createOrder: CreateOrderHandler,
  payOrder: PayOrderHandler,
  logger: Logger,
): void {
  app.post("/orders", async (request, reply) => {
    const order = parseCreateOrder(request.body);
    if (order === undefined) {
      logger.withCorrelation("unparsed").warn("order.invalid");
      return reply.code(400).send({ error: "invalid order" });
    }
    const log = logger.withCorrelation(order.id);
    log.info("order.received");
    await createOrder(order);
    log.info("order.created", { status: order.status });
    return reply.code(201).send({ id: order.id, status: order.status });
  });

  app.post("/orders/:id/pay", async (request, reply) => {
    const orderId = parseOrderIdParams(request.params);
    if (orderId === undefined) {
      logger.withCorrelation("unparsed").warn("order.invalid-id");
      return reply.code(400).send({ error: "invalid order id" });
    }
    const log = logger.withCorrelation(orderId);
    log.info("order.pay-requested");
    try {
      const result = await payOrder(orderId);
      log.info("order.pay-completed", { status: result.status });
      return reply.code(200).send(result);
    } catch (error: unknown) {
      if (error instanceof OrderNotFoundError) {
        log.warn("order.not-found");
        return reply
          .code(404)
          .send({ error: "order not found", orderId: error.orderId });
      }
      log.error("order.pay-failed");
      throw error;
    }
  });
}
