import Fastify, { type FastifyInstance } from "fastify";
import { deliver } from "./domain/deliver.js";
import type { BodyStore } from "./domain/ports/body-store.js";
import type { DeliveryStore } from "./domain/ports/delivery-store.js";
import type { EmailMessage, EmailProvider } from "./domain/ports/email-provider.js";
import {
  createJsonLogger,
  registerTraceHook,
  silentLogger,
  type Logger,
} from "@observability/runtime";
import { CountingEmailProvider } from "./infrastructure/counting-email-provider.js";
import { InMemoryBodyStore } from "./infrastructure/in-memory-body-store.js";
import { InMemoryDeliveryStats } from "./infrastructure/in-memory-delivery-stats.js";
import { InMemoryDeliveryStore } from "./infrastructure/in-memory-delivery-store.js";
import { InMemoryEmailProvider } from "./infrastructure/email-provider.js";
import { FileBodyStore } from "./infrastructure/file-body-store.js";
import { FileDeliveryStore } from "./infrastructure/file-delivery-store.js";
import { FirestoreDeliveryStore } from "./infrastructure/firestore-delivery-store.js";
import { GcsBodyStore } from "./infrastructure/gcs-body-store.js";
import { LoggingEmailProvider } from "./infrastructure/logging-email-provider.js";
import { retryPolicyFromEnv } from "./infrastructure/retry-policy.js";
import { RetryingEmailProvider } from "./infrastructure/retrying-email-provider.js";
import { registerHealthRoute } from "./transport/health-route.js";
import {
  registerInstructionRoute,
  type InstructionHandler,
} from "./transport/instruction-route.js";
import { registerMetricsRoute } from "./transport/metrics-route.js";
import { registerPubSubPushRoute } from "./transport/pubsub-push-route.js";
import { registerSentRoute } from "./transport/sent-route.js";

export type RecordedEmailProvider = EmailProvider & {
  readonly calls: EmailMessage[];
};

export type NotificationApp = {
  server: FastifyInstance;
  bodyStore: InMemoryBodyStore;
  deliveryStore: InMemoryDeliveryStore;
  emailProvider: InMemoryEmailProvider;
  deliveryStats: InMemoryDeliveryStats;
};

export type NotificationRuntime = {
  server: FastifyInstance;
  handleInstruction: InstructionHandler;
  logger: Logger;
};

type BuildOptions = {
  /** Process-local /sent and /metrics. Off in cloud (stub provider, multi-instance). */
  exposeLocalDiagnostics?: boolean;
};

function buildApp(
  bodyStore: BodyStore,
  deliveryStore: DeliveryStore,
  emailProvider: EmailProvider,
  recorded: RecordedEmailProvider,
  logger: Logger,
  deliveryStats: InMemoryDeliveryStats,
  options: BuildOptions = {},
): { server: FastifyInstance; handleInstruction: InstructionHandler } {
  const handleInstruction: InstructionHandler = (instruction) =>
    deliver(instruction, { bodyStore, deliveryStore, emailProvider, logger });
  const server = Fastify();
  registerTraceHook(server, "notification");
  registerHealthRoute(server);
  registerInstructionRoute(server, handleInstruction, logger);
  registerPubSubPushRoute(server, handleInstruction, logger);
  if (options.exposeLocalDiagnostics !== false) {
    registerSentRoute(server, () => recorded.calls, logger);
    registerMetricsRoute(server, deliveryStats, logger);
  }
  return { server, handleInstruction };
}

export function createApp(logger: Logger = silentLogger()): NotificationApp {
  const bodyStore = new InMemoryBodyStore();
  const deliveryStore = new InMemoryDeliveryStore();
  const recorded = new InMemoryEmailProvider();
  const deliveryStats = new InMemoryDeliveryStats();
  const emailProvider = new CountingEmailProvider(recorded, (outcome, attempts) => {
    deliveryStats.record(outcome, attempts);
  });
  return {
    server: buildApp(
      bodyStore,
      deliveryStore,
      emailProvider,
      recorded,
      logger,
      deliveryStats,
    ).server,
    bodyStore,
    deliveryStore,
    emailProvider: recorded,
    deliveryStats,
  };
}

function retryingProvider(
  recorded: RecordedEmailProvider,
  deliveryStats: InMemoryDeliveryStats,
): EmailProvider {
  return new RetryingEmailProvider(recorded, {
    policy: retryPolicyFromEnv(),
    recordAttempt: (outcome, attempts) => {
      deliveryStats.record(outcome, attempts);
    },
  });
}

export function createLocalApp(): NotificationRuntime {
  const logger = createJsonLogger("notification");
  const bodyStoreDir = process.env.BODY_STORE_DIR ?? ".local/bodies";
  const bodyStore = new FileBodyStore(bodyStoreDir);
  const deliveryStore = FileDeliveryStore.besideBodyStore(bodyStoreDir);
  const recorded = new InMemoryEmailProvider();
  const deliveryStats = new InMemoryDeliveryStats();
  return {
    ...buildApp(
      bodyStore,
      deliveryStore,
      retryingProvider(recorded, deliveryStats),
      recorded,
      logger,
      deliveryStats,
      { exposeLocalDiagnostics: true },
    ),
    logger,
  };
}

export function createCloudApp(): NotificationRuntime {
  const logger = createJsonLogger("notification");
  const bodyStore = GcsBodyStore.fromBucketName(requireEnv("BODY_BUCKET"));
  const deliveryStore = FirestoreDeliveryStore.connect(
    requireEnv("FIRESTORE_DATABASE"),
  );
  // Stub provider: logs email.stubbed. No real send; do not expose /sent or /metrics.
  const recorded = new LoggingEmailProvider();
  const deliveryStats = new InMemoryDeliveryStats();
  return {
    ...buildApp(
      bodyStore,
      deliveryStore,
      retryingProvider(recorded, deliveryStats),
      recorded,
      logger,
      deliveryStats,
      { exposeLocalDiagnostics: false },
    ),
    logger,
  };
}

export function createRuntimeApp(): NotificationRuntime {
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
