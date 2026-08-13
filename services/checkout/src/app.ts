import Fastify, { type FastifyInstance } from "fastify";
import { markPaid } from "./domain/mark-paid.js";
import { InMemoryBodyStore } from "./infrastructure/in-memory-body-store.js";
import { InMemoryInstructionPublisher } from "./infrastructure/in-memory-instruction-publisher.js";
import { InMemoryOrderStore } from "./infrastructure/in-memory-order-store.js";
import { registerHealthRoute } from "./transport/health-route.js";
import { registerOrderRoutes } from "./transport/order-routes.js";

export type CheckoutApp = {
  server: FastifyInstance;
  orderStore: InMemoryOrderStore;
  bodyStore: InMemoryBodyStore;
  publisher: InMemoryInstructionPublisher;
};

export function createApp(): CheckoutApp {
  const orderStore = new InMemoryOrderStore();
  const bodyStore = new InMemoryBodyStore();
  const publisher = new InMemoryInstructionPublisher();
  const server = Fastify();

  registerHealthRoute(server);
  registerOrderRoutes(
    server,
    async (order) => {
      await orderStore.save(order);
    },
    (orderId) => markPaid(orderId, { orderStore, bodyStore, publisher }),
  );

  return { server, orderStore, bodyStore, publisher };
}
