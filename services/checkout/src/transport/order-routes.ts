import type { FastifyInstance } from "fastify";
import { InvalidTransitionError } from "../domain/invalid-transition.js";
import type { Logger } from "../domain/ports/logger.js";
import type { MarkPaidResult } from "../domain/mark-paid.js";
import { OrderNotFoundError } from "../domain/order-not-found.js";
import type { OrderView } from "../domain/get-order-view.js";
import {
  parseCreateOrder,
  parseOrderIdParams,
  type Order,
} from "../domain/order.js";

export type CreateOrderHandler = (order: Order) => Promise<void>;
export type PayOrderHandler = (orderId: string) => Promise<MarkPaidResult>;
export type GetOrderHandler = (orderId: string) => Promise<OrderView>;

export function registerOrderRoutes(
  app: FastifyInstance,
  createOrder: CreateOrderHandler,
  payOrder: PayOrderHandler,
  getOrder: GetOrderHandler,
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
    log.info("order.created", { status: order.status, shippingTier: order.shippingTier });
    return reply.code(201).send({
      id: order.id,
      status: order.status,
      shippingTier: order.shippingTier,
    });
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
      if (error instanceof InvalidTransitionError) {
        log.warn("order.invalid-transition", {
          from: error.from,
          to: error.to,
        });
        return reply.code(409).send({
          error: "invalid transition",
          from: error.from,
          to: error.to,
        });
      }
      log.error("order.pay-failed");
      throw error;
    }
  });

  app.get("/orders/:id", async (request, reply) => {
    const orderId = parseOrderIdParams(request.params);
    if (orderId === undefined) {
      logger.withCorrelation("unparsed").warn("order.invalid-id");
      return reply.code(400).send({ error: "invalid order id" });
    }
    const log = logger.withCorrelation(orderId);
    log.info("order.view-requested");
    try {
      const view = await getOrder(orderId);
      log.info("order.viewed", {
        confirmationDelivered: view.confirmationDelivered,
      });
      return reply.code(200).send(view);
    } catch (error: unknown) {
      if (error instanceof OrderNotFoundError) {
        log.warn("order.not-found");
        return reply
          .code(404)
          .send({ error: "order not found", orderId: error.orderId });
      }
      log.error("order.view-failed");
      throw error;
    }
  });
}
