import type { FastifyInstance } from "fastify";
import type { Log } from "../domain/ports/logger.js";
import {
  parseReservationCommand,
  type ReservationCommand,
} from "../domain/reservation-command.js";
import { withPubSubConsume } from "./trace-context.js";

export type ReservationHandler = (command: ReservationCommand) => Promise<void>;

function decodePushBody(body: unknown): Buffer | undefined {
  if (typeof body !== "object" || body === null || !("message" in body)) {
    return undefined;
  }
  const message = (body as { message: unknown }).message;
  if (typeof message !== "object" || message === null || !("data" in message)) {
    return undefined;
  }
  const data = (message as { data: unknown }).data;
  if (typeof data !== "string" || data.length === 0) {
    return undefined;
  }
  return Buffer.from(data, "base64");
}

export async function processReservationBytes(
  data: Buffer,
  handle: ReservationHandler,
  log: Log,
): Promise<"ack" | "nack"> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data.toString("utf8")) as unknown;
  } catch {
    log.bind("unparsed").warn("reservation.invalid");
    return "ack";
  }
  const command = parseReservationCommand(parsed);
  if (command === undefined) {
    log.bind("unparsed").warn("reservation.invalid");
    return "ack";
  }
  try {
    await handle(command);
    return "ack";
  } catch {
    log.bind(command.orderId).error("reservation.nacked");
    return "nack";
  }
}

export function registerReservationPushRoute(
  app: FastifyInstance,
  handle: ReservationHandler,
  log: Log,
): void {
  app.post("/pubsub", async (request, reply) => {
    return withPubSubConsume(request, async () => {
      const bytes = decodePushBody(request.body);
      if (bytes === undefined) {
        log.bind("unparsed").warn("pubsub.invalid");
        return reply.code(400).send({ error: "invalid pubsub envelope" });
      }
      const decision = await processReservationBytes(bytes, handle, log);
      if (decision === "nack") {
        return reply.code(500).send({ error: "nack" });
      }
      return reply.code(204).send();
    });
  });
}
