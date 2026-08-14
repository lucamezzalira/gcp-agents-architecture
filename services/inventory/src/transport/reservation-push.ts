import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Logger } from "../domain/ports/logger.js";
import { parseReservationCommand } from "../domain/reservation-command.js";
import type { ReservationCommand } from "../domain/reservation-command.js";

const envelopeSchema = z.object({
  message: z.object({
    data: z.string().min(1),
  }),
});

export type ReservationHandler = (command: ReservationCommand) => Promise<void>;

export async function processReservationBytes(
  data: Buffer,
  handle: ReservationHandler,
  logger: Logger,
): Promise<"ack" | "nack"> {
  let payload: unknown;
  try {
    payload = JSON.parse(data.toString("utf8")) as unknown;
  } catch {
    logger.withCorrelation("unparsed").warn("reservation.invalid");
    return "ack";
  }
  const command = parseReservationCommand(payload);
  if (command === undefined) {
    logger.withCorrelation("unparsed").warn("reservation.invalid");
    return "ack";
  }
  try {
    await handle(command);
    return "ack";
  } catch {
    logger.withCorrelation(command.orderId).error("reservation.nacked");
    return "nack";
  }
}

export function registerReservationPushRoute(
  app: FastifyInstance,
  handle: ReservationHandler,
  logger: Logger,
): void {
  app.post("/pubsub", async (request, reply) => {
    const parsed = envelopeSchema.safeParse(request.body);
    if (!parsed.success) {
      logger.withCorrelation("unparsed").warn("pubsub.invalid");
      return reply.code(400).send({ error: "invalid pubsub envelope" });
    }
    const data = Buffer.from(parsed.data.message.data, "base64");
    const decision = await processReservationBytes(data, handle, logger);
    if (decision === "nack") {
      return reply.code(500).send({ error: "nack" });
    }
    return reply.code(204).send();
  });
}
