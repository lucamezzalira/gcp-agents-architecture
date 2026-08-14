import Fastify, { type FastifyInstance } from "fastify";
import type { LowStockMailer } from "./domain/alert-low-stock.js";
import { handleReservation } from "./domain/handle-reservation.js";
import {
  createJsonLogger,
  registerTraceHook,
  silentLogger,
  type Logger,
} from "@observability/runtime";
import type { OutcomePublisher } from "./domain/ports/outcome-publisher.js";
import type { ReservationStore } from "./domain/ports/reservation-store.js";
import type { StockStore } from "./domain/ports/stock-store.js";
import { DEFAULT_SKU } from "./domain/stock.js";
import {
  expireHeldInAdapter,
  HELD_TTL_MS,
} from "./infrastructure/expire-held.js";
import {
  asReservationStore,
  FirestoreInventory,
} from "./infrastructure/firestore-inventory.js";
import { GcsHtml } from "./infrastructure/gcs-html.js";
import { HttpInstructionPublisher } from "./infrastructure/http-instruction-publisher.js";
import { MemoryHtml } from "./infrastructure/memory-html.js";
import { MemoryMail } from "./infrastructure/memory-mail.js";
import { MemoryOutcomes } from "./infrastructure/memory-outcomes.js";
import { MemoryReservations } from "./infrastructure/memory-reservations.js";
import { MemoryStock } from "./infrastructure/memory-stock.js";
import { PubSubOutcomes } from "./infrastructure/pubsub-outcomes.js";
import { PubSubInstructionPublisher } from "./infrastructure/pubsub-instruction-publisher.js";
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
  mail: MemoryMail;
  html: MemoryHtml;
};

function buildServer(
  stock: StockStore,
  reservations: ReservationStore,
  outcomes: OutcomePublisher,
  logger: Logger,
  ttlMs: number,
  lowStock?: LowStockMailer,
): FastifyInstance {
  const handle: ReservationHandler = async (command) => {
    await expireHeldInAdapter(
      { stock, reservations, outcomes, log: logger },
      new Date(),
      ttlMs,
    );
    await handleReservation(command, {
      stock,
      reservations,
      outcomes,
      logger,
      now: () => new Date(),
      lowStock,
    });
  };
  const server = Fastify();
  registerTraceHook(server, "inventory");
  registerHealthRoute(server);
  registerStockRoutes(server, stock, logger);
  registerReservationPushRoute(server, handle, logger);
  server.post("/expire", async (_request, reply) => {
    const count = await expireHeldInAdapter(
      { stock, reservations, outcomes, log: logger },
      new Date(),
      ttlMs,
    );
    return reply.code(200).send({ expired: count });
  });
  return server;
}

export function createApp(logger: Logger = silentLogger()): InventoryApp {
  const stock = new MemoryStock();
  const reservations = new MemoryReservations();
  const outcomes = new MemoryOutcomes();
  const html = new MemoryHtml();
  const mail = new MemoryMail();
  return {
    server: buildServer(
      stock,
      reservations,
      outcomes,
      logger,
      HELD_TTL_MS,
      { html, mailer: mail },
    ),
    stock,
    reservations,
    outcomes,
    mail,
    html,
  };
}

export function createLocalApp(): FastifyInstance {
  const stock = new MemoryStock();
  void stock.save({ sku: DEFAULT_SKU, available: 100 });
  const html = new MemoryHtml();
  const mailer =
    process.env.NOTIFICATION_URL !== undefined &&
    process.env.NOTIFICATION_URL.length > 0
      ? new HttpInstructionPublisher(process.env.NOTIFICATION_URL)
      : new MemoryMail();
  return buildServer(
    stock,
    new MemoryReservations(),
    new MemoryOutcomes(),
    createJsonLogger("inventory"),
    HELD_TTL_MS,
    { html, mailer },
  );
}

export function createCloudApp(): FastifyInstance {
  const firestore = FirestoreInventory.connect(requireEnv("FIRESTORE_DATABASE"));
  const bucket = process.env.BODY_BUCKET;
  const topic = process.env.SEND_INSTRUCTIONS_TOPIC;
  const lowStock =
    bucket !== undefined &&
    bucket.length > 0 &&
    topic !== undefined &&
    topic.length > 0
      ? {
          html: new GcsHtml(bucket),
          mailer: PubSubInstructionPublisher.fromTopicName(topic),
        }
      : undefined;
  return buildServer(
    firestore,
    asReservationStore(firestore),
    PubSubOutcomes.forTopic(requireEnv("RESERVATION_OUTCOMES_TOPIC")),
    createJsonLogger("inventory"),
    Number(process.env.RESERVATION_TTL_MS ?? HELD_TTL_MS),
    lowStock,
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
