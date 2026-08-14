import Fastify, { type FastifyInstance } from "fastify";
import type { Tape } from "./domain/ports/tape.js";
import { FirestoreTape } from "./infrastructure/firestore-tape.js";
import { MemoryTape } from "./infrastructure/memory-tape.js";
import { stampIntake } from "./infrastructure/telemetry.js";
import { mountIntake } from "./transport/intake.js";
import { mountStatus } from "./transport/status.js";

export function buildAudit(tape: Tape): FastifyInstance {
  const server = Fastify();
  mountStatus(server);
  mountIntake(server, tape, stampIntake);
  return server;
}

export function createLocalApp(): FastifyInstance {
  return buildAudit(new MemoryTape());
}

export function createCloudApp(): FastifyInstance {
  const databaseId = process.env.FIRESTORE_DATABASE;
  if (databaseId === undefined || databaseId.length === 0) {
    throw new Error("missing FIRESTORE_DATABASE");
  }
  return buildAudit(FirestoreTape.connect(databaseId));
}

export function createRuntimeApp(): FastifyInstance {
  if (process.env.FIRESTORE_DATABASE) {
    return createCloudApp();
  }
  return createLocalApp();
}
