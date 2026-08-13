import Fastify, { type FastifyInstance } from "fastify";
import { deliver } from "./domain/deliver.js";
import { InMemoryBodyStore } from "./infrastructure/in-memory-body-store.js";
import { InMemoryDeliveryStore } from "./infrastructure/in-memory-delivery-store.js";
import { InMemoryEmailProvider } from "./infrastructure/email-provider.js";
import { registerHealthRoute } from "./transport/health-route.js";
import { registerInstructionRoute } from "./transport/instruction-route.js";

export type NotificationApp = {
  server: FastifyInstance;
  bodyStore: InMemoryBodyStore;
  deliveryStore: InMemoryDeliveryStore;
  emailProvider: InMemoryEmailProvider;
};

export function createApp(): NotificationApp {
  const bodyStore = new InMemoryBodyStore();
  const deliveryStore = new InMemoryDeliveryStore();
  const emailProvider = new InMemoryEmailProvider();
  const server = Fastify();

  registerHealthRoute(server);
  registerInstructionRoute(server, (instruction) =>
    deliver(instruction, { bodyStore, deliveryStore, emailProvider }),
  );

  return { server, bodyStore, deliveryStore, emailProvider };
}
