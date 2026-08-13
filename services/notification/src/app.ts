import Fastify, { type FastifyInstance } from "fastify";
import { deliver } from "./domain/deliver.js";
import type { BodyStore } from "./domain/body-store.js";
import type { DeliveryStore } from "./domain/delivery-store.js";
import type { EmailMessage, EmailProvider } from "./domain/email-provider.js";
import { InMemoryBodyStore } from "./infrastructure/in-memory-body-store.js";
import { InMemoryDeliveryStore } from "./infrastructure/in-memory-delivery-store.js";
import { InMemoryEmailProvider } from "./infrastructure/email-provider.js";
import { FileBodyStore } from "./infrastructure/file-body-store.js";
import { FirestoreDeliveryStore } from "./infrastructure/firestore-delivery-store.js";
import { GcsBodyStore } from "./infrastructure/gcs-body-store.js";
import { LoggingEmailProvider } from "./infrastructure/logging-email-provider.js";
import { registerHealthRoute } from "./transport/health-route.js";
import {
  registerInstructionRoute,
  type InstructionHandler,
} from "./transport/instruction-route.js";
import { registerSentRoute } from "./transport/sent-route.js";

export type RecordedEmailProvider = EmailProvider & {
  readonly calls: EmailMessage[];
};

export type NotificationApp = {
  server: FastifyInstance;
  bodyStore: InMemoryBodyStore;
  deliveryStore: InMemoryDeliveryStore;
  emailProvider: InMemoryEmailProvider;
};

export type NotificationRuntime = {
  server: FastifyInstance;
  handleInstruction: InstructionHandler;
};

function buildApp(
  bodyStore: BodyStore,
  deliveryStore: DeliveryStore,
  emailProvider: RecordedEmailProvider,
): { server: FastifyInstance; handleInstruction: InstructionHandler } {
  const handleInstruction: InstructionHandler = (instruction) =>
    deliver(instruction, { bodyStore, deliveryStore, emailProvider });
  const server = Fastify();
  registerHealthRoute(server);
  registerInstructionRoute(server, handleInstruction);
  registerSentRoute(server, () => emailProvider.calls);
  return { server, handleInstruction };
}

export function createApp(): NotificationApp {
  const bodyStore = new InMemoryBodyStore();
  const deliveryStore = new InMemoryDeliveryStore();
  const emailProvider = new InMemoryEmailProvider();
  return {
    server: buildApp(bodyStore, deliveryStore, emailProvider).server,
    bodyStore,
    deliveryStore,
    emailProvider,
  };
}

export function createLocalApp(): NotificationRuntime {
  const bodyStore = new FileBodyStore(
    process.env.BODY_STORE_DIR ?? ".local/bodies",
  );
  const deliveryStore = new InMemoryDeliveryStore();
  const emailProvider = new InMemoryEmailProvider();
  return buildApp(bodyStore, deliveryStore, emailProvider);
}

export function createCloudApp(): NotificationRuntime {
  const bodyStore = GcsBodyStore.fromBucketName(requireEnv("BODY_BUCKET"));
  const deliveryStore = FirestoreDeliveryStore.connect(
    requireEnv("FIRESTORE_DATABASE"),
  );
  const emailProvider = new LoggingEmailProvider();
  return buildApp(bodyStore, deliveryStore, emailProvider);
}

export function createRuntimeApp(): NotificationRuntime {
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
