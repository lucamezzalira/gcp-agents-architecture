import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withPubSubConsume, type Logger } from "@observability/runtime";
import type { ReservationOutcomeSink } from "../domain/ports/reservation-outcome-sink.js";
import { parseReservationOutcome } from "../domain/reservation-outcome.js";

const envelopeSchema = z.object({
  message: z.object({
    data: z.string().min(1),
    attributes: z.record(z.string(), z.string()).optional(),
  }),
});

export function registerOutcomePushRoute(
  app: FastifyInstance,
  sink: ReservationOutcomeSink,
  logger: Logger,
): void {
  app.post("/reservation-outcomes", async (request, reply) => {
    return withPubSubConsume(request, "checkout", async () => {
      const parsed = envelopeSchema.safeParse(request.body);
      if (!parsed.success) {
        logger.withCorrelation("unparsed").warn("outcome.invalid");
        return reply.code(400).send({ error: "invalid pubsub envelope" });
      }
      let payload: unknown;
      try {
        payload = JSON.parse(
          Buffer.from(parsed.data.message.data, "base64").toString("utf8"),
        ) as unknown;
      } catch {
        logger.withCorrelation("unparsed").warn("outcome.invalid");
        return reply.code(204).send();
      }
      const outcome = parseReservationOutcome(payload);
      if (outcome === undefined) {
        logger.withCorrelation("unparsed").warn("outcome.invalid");
        return reply.code(204).send();
      }
      await sink.record(outcome);
      logger.withCorrelation(outcome.orderId).info("outcome.recorded", {
        result: outcome.result,
      });
      return reply.code(204).send();
    });
  });
}
