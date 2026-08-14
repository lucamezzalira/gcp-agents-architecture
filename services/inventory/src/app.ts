import Fastify, { type FastifyInstance } from "fastify";
import {
  DEFAULT_RESERVATION_TTL_MS,
  expireReservations,
} from "./domain/expire-reservations.js";
import { handleReservation } from "./domain/handle-reservation.js";
import { quietLog, type Log } from "./domain/ports/logger.js";
import type { OutcomePublisher } from "./domain/ports/outcome-publisher.js";
import type { ReservationStore } from "./domain/ports/reservation-store.js";
import type { StockStore } from "./domain/ports/stock-store.js";
import { DEFAULT_SKU } from "./domain/stock.js";
import {
  asReservationStore,
  FirestoreInventory,
} from "./infrastructure/firestore-inventory.js";
import { LineLogger } from "./infrastructure/line-logger.js";
import { MemoryOutcomes } from "./infrastructure/memory-outcomes.js";
import { MemoryReservations } from "./infrastructure/memory-reservations.js";
import { MemoryStock } from "./infrastructure/memory-stock.js";
import { PubSubOutcomes } from "./infrastructure/pubsub-outcomes.js";
import { registerHealthRoute } from "./transport/health-route.js";
import {
  registerReservationPushRoute,
  type ReservationHandler,
} from "./transport/reservation-push.js";
import { registerStockRoutes } from "./transport/stock-routes.js";

export type InventoryApp = {
  server: FastifyInstance;
  stock: MemoryStock;
  reservations: MemoryReservations;
  outcomes: MemoryOutcomes;
};

function buildServer(
  stock: StockStore,
  reservations: ReservationStore,
  outcomes: OutcomePublisher,
  logger: Log,
  ttlMs: number,
): FastifyInstance {
  const handle: ReservationHandler = async (command) => {
    await expireReservations(
      { stock, reservations, outcomes, logger },
      new Date(),
      ttlMs,
    );
    await handleReservation(command, {
      stock,
      reservations,
      outcomes,
      logger,
      now: () => new Date(),
    });
  };
  const server = Fastify();
  registerHealthRoute(server);
  registerStockRoutes(server, stock, logger);
  registerReservationPushRoute(server, handle, logger);
  server.post("/expire", async (_request, reply) => {
    const count = await expireReservations(
      { stock, reservations, outcomes, logger },
      new Date(),
      ttlMs,
    );
    return reply.code(200).send({ expired: count });
  });
  return server;
}

export function createApp(logger: Log = quietLog()): InventoryApp {
  const stock = new MemoryStock();
  const reservations = new MemoryReservations();
  const outcomes = new MemoryOutcomes();
  return {
    server: buildServer(
      stock,
      reservations,
      outcomes,
      logger,
      DEFAULT_RESERVATION_TTL_MS,
    ),
    stock,
    reservations,
    outcomes,
  };
}

export function createLocalApp(): FastifyInstance {
  const stock = new MemoryStock();
  void stock.save({ sku: DEFAULT_SKU, available: 100 });
  return buildServer(
    stock,
    new MemoryReservations(),
    new MemoryOutcomes(),
    new LineLogger("inventory"),
    DEFAULT_RESERVATION_TTL_MS,
  );
}

export function createCloudApp(): FastifyInstance {
  const firestore = FirestoreInventory.connect(requireEnv("FIRESTORE_DATABASE"));
  return buildServer(
    firestore,
    asReservationStore(firestore),
    PubSubOutcomes.forTopic(requireEnv("RESERVATION_OUTCOMES_TOPIC")),
    new LineLogger("inventory"),
    Number(process.env.RESERVATION_TTL_MS ?? DEFAULT_RESERVATION_TTL_MS),
  );
}

export function createRuntimeApp(): FastifyInstance {
  if (process.env.FIRESTORE_DATABASE) {
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
