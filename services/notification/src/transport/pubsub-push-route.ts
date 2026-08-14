import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withPubSubConsume, type Logger } from "@observability/runtime";
import { processInstructionMessage } from "./instruction-subscriber.js";
import type { InstructionHandler } from "./instruction-route.js";

const envelopeSchema = z.object({
  message: z.object({
    data: z.string().min(1),
    attributes: z.record(z.string(), z.string()).optional(),
  }),
});

export function registerPubSubPushRoute(
  app: FastifyInstance,
  handle: InstructionHandler,
  logger: Logger,
): void {
  app.post("/pubsub", async (request, reply) => {
    return withPubSubConsume(request, "notification", async () => {
      const parsed = envelopeSchema.safeParse(request.body);
      if (!parsed.success) {
        logger.withCorrelation("unparsed").warn("pubsub.invalid");
        return reply.code(400).send({ error: "invalid pubsub envelope" });
      }
      const data = Buffer.from(parsed.data.message.data, "base64");
      const decision = await processInstructionMessage(data, handle, logger);
      if (decision === "nack") {
        return reply.code(500).send({ error: "nack" });
      }
      return reply.code(204).send();
    });
  });
}
