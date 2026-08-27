import Fastify, { type FastifyInstance } from "fastify";
import { cancelOrder } from "./domain/cancel-order.js";
import { getOrderView } from "./domain/get-order-view.js";
import { markPaid } from "./domain/mark-paid.js";
import { placeOrder } from "./domain/place-order.js";
import type { BodyStore } from "./domain/ports/body-store.js";
import type { InstructionPublisher } from "./domain/ports/instruction-publisher.js";
import {
  createJsonLogger,
  registerTraceHook,
  silentLogger,
  type Logger,
} from "@observability/runtime";
import type { OrderStore } from "./domain/ports/order-store.js";
import type { ReservationOutcomeSink } from "./domain/ports/reservation-outcome-sink.js";
import type { ReservationPublisher } from "./domain/ports/reservation-publisher.js";
import { FileBodyStore } from "./infrastructure/file-body-store.js";
import { FirestoreOrderStore } from "./infrastructure/firestore-order-store.js";
import { FirestoreReservationOutcomes } from "./infrastructure/firestore-reservation-outcomes.js";
import { GcsBodyStore } from "./infrastructure/gcs-body-store.js";
import { HttpInstructionPublisher } from "./infrastructure/http-instruction-publisher.js";
import { InMemoryBodyStore } from "./infrastructure/in-memory-body-store.js";
import { InMemoryInstructionPublisher } from "./infrastructure/in-memory-instruction-publisher.js";
import { InMemoryOrderStore } from "./infrastructure/in-memory-order-store.js";
import { MemoryReservationOutcomes } from "./infrastructure/memory-reservation-outcomes.js";
import { MemoryReservationPublisher } from "./infrastructure/memory-reservation-publisher.js";
import { PubSubInstructionPublisher } from "./infrastructure/pubsub-instruction-publisher.js";
import { PubSubReservationPublisher } from "./infrastructure/pubsub-reservation-publisher.js";
import { registerHealthRoute } from "./transport/health-route.js";
import { registerOrderRoutes } from "./transport/order-routes.js";
import { registerOutcomePushRoute } from "./transport/outcome-push.js";

export type CheckoutApp = {
  server: FastifyInstance;
  orderStore: InMemoryOrderStore;
  bodyStore: InMemoryBodyStore;
  publisher: InMemoryInstructionPublisher;
  reservations: MemoryReservationPublisher;
  reservationOutcomes: MemoryReservationOutcomes;
};

function buildServer(
  orderStore: OrderStore,
  bodyStore: BodyStore,
  publisher: InstructionPublisher,
  reservations: ReservationPublisher,
  reservationOutcomes: ReservationOutcomeSink,
  logger: Logger,
): FastifyInstance {
  const server = Fastify();
  registerTraceHook(server, "checkout");
  registerHealthRoute(server);
  registerOrderRoutes(
    server,
    (order) => placeOrder(order, { orderStore, reservations, logger }),
    (orderId) =>
      markPaid(orderId, {
        orderStore,
        bodyStore,
        publisher,
        reservations,
        reservationOutcomes,
        logger,
      }),
    (orderId) =>
      getOrderView(orderId, { orderStore, reservationOutcomes }),
    (orderId) => cancelOrder(orderId, { orderStore, reservations, logger }),
    logger,
  );
  registerOutcomePushRoute(server, reservationOutcomes, logger);
  return server;
}

export function createApp(logger: Logger = silentLogger()): CheckoutApp {
  const orderStore = new InMemoryOrderStore();
  const bodyStore = new InMemoryBodyStore();
  const publisher = new InMemoryInstructionPublisher();
  const reservationOutcomes = new MemoryReservationOutcomes();
  const reservations = new MemoryReservationPublisher(reservationOutcomes);
  return {
    server: buildServer(
      orderStore,
      bodyStore,
      publisher,
      reservations,
      reservationOutcomes,
      logger,
    ),
    orderStore,
    bodyStore,
    publisher,
    reservations,
    reservationOutcomes,
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
  const reservationOutcomes = new MemoryReservationOutcomes();
  const reservations = new MemoryReservationPublisher(reservationOutcomes);
  return buildServer(
    orderStore,
    bodyStore,
    publisher,
    reservations,
    reservationOutcomes,
    createJsonLogger("checkout"),
  );
}

export function createCloudApp(): FastifyInstance {
  const database = requireEnv("FIRESTORE_DATABASE");
  const orderStore = FirestoreOrderStore.connect(database);
  const bodyStore = GcsBodyStore.fromBucketName(requireEnv("BODY_BUCKET"));
  const publisher = PubSubInstructionPublisher.fromTopicName(
    requireEnv("SEND_INSTRUCTIONS_TOPIC"),
  );
  const reservations = PubSubReservationPublisher.forTopic(
    requireEnv("STOCK_RESERVATIONS_TOPIC"),
  );
  return buildServer(
    orderStore,
    bodyStore,
    publisher,
    reservations,
    FirestoreReservationOutcomes.connect(database),
    createJsonLogger("checkout"),
  );
}

export function createRuntimeApp(): FastifyInstance {
  if (preferCloudRuntime()) {
    return createCloudApp();
  }
  return createLocalApp();
}

function preferCloudRuntime(): boolean {
  const mode = process.env.RUNTIME_MODE;
  if (mode === "cloud") {
    return true;
  }
  if (mode === "local") {
    return false;
  }
  return Boolean(process.env.BODY_BUCKET) || Boolean(process.env.FIRESTORE_DATABASE);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`missing ${name}`);
  }
  return value;
}
