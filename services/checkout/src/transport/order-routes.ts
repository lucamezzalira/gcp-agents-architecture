import type { FastifyInstance } from "fastify";
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
): void {
  app.post("/orders", async (request, reply) => {
    const order = parseCreateOrder(request.body);
    if (order === undefined) {
      return reply.code(400).send({ error: "invalid order" });
    }
    await createOrder(order);
    return reply.code(201).send({ id: order.id, status: order.status });
  });

  app.post("/orders/:id/pay", async (request, reply) => {
    const orderId = parseOrderIdParams(request.params);
    if (orderId === undefined) {
      return reply.code(400).send({ error: "invalid order id" });
    }
    try {
      const result = await payOrder(orderId);
      return reply.code(200).send(result);
    } catch (error: unknown) {
      if (error instanceof OrderNotFoundError) {
        return reply
          .code(404)
          .send({ error: "order not found", orderId: error.orderId });
      }
      throw error;
    }
  });
}
