import Fastify, { type FastifyInstance } from "fastify";
import { getOrderView } from "./domain/get-order-view.js";
import { markPaid } from "./domain/mark-paid.js";
import type { BodyStore } from "./domain/body-store.js";
import type { DeliveryStatusLookup } from "./domain/delivery-status-lookup.js";
import type { InstructionPublisher } from "./domain/instruction-publisher.js";
import { silentLogger, type Logger } from "./domain/logger.js";
import type { Mailer } from "./domain/mailer.js";
import type { OrderStore } from "./domain/order-store.js";
import {
  DirectEmailProvider,
  InMemoryEmailProvider,
} from "./infrastructure/email-provider.js";
import { FileBodyStore } from "./infrastructure/file-body-store.js";
import { FirestoreOrderStore } from "./infrastructure/firestore-order-store.js";
import { GcsBodyStore } from "./infrastructure/gcs-body-store.js";
import { HttpInstructionPublisher } from "./infrastructure/http-instruction-publisher.js";
import { InMemoryBodyStore } from "./infrastructure/in-memory-body-store.js";
import { InMemoryDeliveryStatusLookup } from "./infrastructure/in-memory-delivery-status-lookup.js";
import { InMemoryInstructionPublisher } from "./infrastructure/in-memory-instruction-publisher.js";
import { InMemoryOrderStore } from "./infrastructure/in-memory-order-store.js";
import { JsonLogger } from "./infrastructure/json-logger.js";
import { NotificationDeliveryLookup } from "./infrastructure/notification-delivery-store.js";
import { PubSubInstructionPublisher } from "./infrastructure/pubsub-instruction-publisher.js";
import { registerHealthRoute } from "./transport/health-route.js";
import { registerOrderRoutes } from "./transport/order-routes.js";

export type CheckoutApp = {
  server: FastifyInstance;
  orderStore: InMemoryOrderStore;
  bodyStore: InMemoryBodyStore;
  publisher: InMemoryInstructionPublisher;
  emailProvider: InMemoryEmailProvider;
  deliveryStatus: InMemoryDeliveryStatusLookup;
};

function buildServer(
  orderStore: OrderStore,
  bodyStore: BodyStore,
  publisher: InstructionPublisher,
  mailer: Mailer,
  deliveryStatus: DeliveryStatusLookup,
  logger: Logger,
): FastifyInstance {
  const server = Fastify();
  registerHealthRoute(server);
  registerOrderRoutes(
    server,
    async (order) => {
      await orderStore.save(order);
    },
    (orderId) =>
      markPaid(orderId, {
        orderStore,
        bodyStore,
        publisher,
        mailer,
        logger,
      }),
    (orderId) => getOrderView(orderId, { orderStore, deliveryStatus }),
    logger,
  );
  return server;
}

export function createApp(logger: Logger = silentLogger()): CheckoutApp {
  const orderStore = new InMemoryOrderStore();
  const bodyStore = new InMemoryBodyStore();
  const publisher = new InMemoryInstructionPublisher();
  const emailProvider = new InMemoryEmailProvider();
  const deliveryStatus = new InMemoryDeliveryStatusLookup();
  return {
    server: buildServer(
      orderStore,
      bodyStore,
      publisher,
      emailProvider,
      deliveryStatus,
      logger,
    ),
    orderStore,
    bodyStore,
    publisher,
    emailProvider,
    deliveryStatus,
  };
}

export function createLocalApp(): FastifyInstance {
  const orderStore = new InMemoryOrderStore();
  const bodyStore = new FileBodyStore(
    process.env.BODY_STORE_DIR ?? ".local/bodies",
  );
  const publisher = new HttpInstructionPublisher(
    process.env.NOTIFICATION_URL ?? "http://127.0.0.1:3001/instructions",
  );
  return buildServer(
    orderStore,
    bodyStore,
    publisher,
    new DirectEmailProvider(),
    new InMemoryDeliveryStatusLookup(),
    new JsonLogger(),
  );
}

export function createCloudApp(): FastifyInstance {
  const orderStore = FirestoreOrderStore.connect(requireEnv("FIRESTORE_DATABASE"));
  const bodyStore = GcsBodyStore.fromBucketName(requireEnv("BODY_BUCKET"));
  const publisher = PubSubInstructionPublisher.fromTopicName(
    requireEnv("SEND_INSTRUCTIONS_TOPIC"),
  );
  return buildServer(
    orderStore,
    bodyStore,
    publisher,
    new DirectEmailProvider(),
    NotificationDeliveryLookup.connect(
      process.env.NOTIFICATION_FIRESTORE_DATABASE ?? "notification",
    ),
    new JsonLogger(),
  );
}

export function createRuntimeApp(): FastifyInstance {
  if (process.env.BODY_BUCKET) {
    return createCloudApp();
  }
  return createLocalApp();
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`missing ${name}`);
  }
  return value;
}
