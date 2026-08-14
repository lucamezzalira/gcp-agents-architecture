import Fastify, { type FastifyInstance } from "fastify";
import { cancelOrder } from "./domain/cancel-order.js";
import { getOrderView } from "./domain/get-order-view.js";
import { markPaid } from "./domain/mark-paid.js";
import { placeOrder } from "./domain/place-order.js";
import type { BodyStore } from "./domain/ports/body-store.js";
import type { DeliveryStatusLookup } from "./domain/ports/delivery-status-lookup.js";
import type { InstructionPublisher } from "./domain/ports/instruction-publisher.js";
import { silentLogger, type Logger } from "./domain/ports/logger.js";
import type { OrderStore } from "./domain/ports/order-store.js";
import type { StockOutcomeSink } from "./domain/ports/stock-outcome-sink.js";
import type { StockReservationPublisher } from "./domain/ports/stock-reservation-publisher.js";
import { FileBodyStore } from "./infrastructure/file-body-store.js";
import { FirestoreOrderStore } from "./infrastructure/firestore-order-store.js";
import { GcsBodyStore } from "./infrastructure/gcs-body-store.js";
import { HttpInstructionPublisher } from "./infrastructure/http-instruction-publisher.js";
import { InMemoryBodyStore } from "./infrastructure/in-memory-body-store.js";
import { InMemoryDeliveryStatusLookup } from "./infrastructure/in-memory-delivery-status-lookup.js";
import { InMemoryInstructionPublisher } from "./infrastructure/in-memory-instruction-publisher.js";
import { InMemoryOrderStore } from "./infrastructure/in-memory-order-store.js";
import { JsonLogger } from "./infrastructure/json-logger.js";
import { MemoryStockOutcomes } from "./infrastructure/memory-stock-outcomes.js";
import { MemoryStockReservations } from "./infrastructure/memory-stock-reservations.js";
import { PubSubInstructionPublisher } from "./infrastructure/pubsub-instruction-publisher.js";
import { PubSubStockReservations } from "./infrastructure/pubsub-stock-reservations.js";
import { registerHealthRoute } from "./transport/health-route.js";
import { registerOrderRoutes } from "./transport/order-routes.js";
import { registerOutcomePushRoute } from "./transport/outcome-push.js";

export type CheckoutApp = {
  server: FastifyInstance;
  orderStore: InMemoryOrderStore;
  bodyStore: InMemoryBodyStore;
  publisher: InMemoryInstructionPublisher;
  stockReservations: MemoryStockReservations;
  stockOutcomes: MemoryStockOutcomes;
  deliveryStatus: InMemoryDeliveryStatusLookup;
};

function buildServer(
  orderStore: OrderStore,
  bodyStore: BodyStore,
  publisher: InstructionPublisher,
  stockReservations: StockReservationPublisher,
  stockOutcomes: StockOutcomeSink,
  deliveryStatus: DeliveryStatusLookup,
  logger: Logger,
): FastifyInstance {
  const server = Fastify();
  registerHealthRoute(server);
  registerOrderRoutes(
    server,
    (order) => placeOrder(order, { orderStore, stockReservations, logger }),
    (orderId) =>
      markPaid(orderId, {
        orderStore,
        bodyStore,
        publisher,
        stockReservations,
        logger,
      }),
    (orderId) => getOrderView(orderId, { orderStore, deliveryStatus }),
    (orderId) => cancelOrder(orderId, { orderStore, stockReservations, logger }),
    logger,
  );
  registerOutcomePushRoute(server, stockOutcomes, logger);
  return server;
}

export function createApp(logger: Logger = silentLogger()): CheckoutApp {
  const orderStore = new InMemoryOrderStore();
  const bodyStore = new InMemoryBodyStore();
  const publisher = new InMemoryInstructionPublisher();
  const stockReservations = new MemoryStockReservations();
  const stockOutcomes = new MemoryStockOutcomes();
  const deliveryStatus = new InMemoryDeliveryStatusLookup();
  return {
    server: buildServer(
      orderStore,
      bodyStore,
      publisher,
      stockReservations,
      stockOutcomes,
      deliveryStatus,
      logger,
    ),
    orderStore,
    bodyStore,
    publisher,
    stockReservations,
    stockOutcomes,
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
    new MemoryStockReservations(),
    new MemoryStockOutcomes(),
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
  const stockReservations = PubSubStockReservations.forTopic(
    requireEnv("STOCK_RESERVATIONS_TOPIC"),
  );
  return buildServer(
    orderStore,
    bodyStore,
    publisher,
    stockReservations,
    new MemoryStockOutcomes(),
    new InMemoryDeliveryStatusLookup(),
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
