import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { processInstructionMessage } from "./instruction-subscriber.js";
import type { InstructionHandler } from "./instruction-route.js";

const envelopeSchema = z.object({
  message: z.object({
    data: z.string().min(1),
  }),
});

export function registerPubSubPushRoute(
  app: FastifyInstance,
  handle: InstructionHandler,
): void {
  app.post("/pubsub", async (request, reply) => {
    const parsed = envelopeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid pubsub envelope" });
    }
    const data = Buffer.from(parsed.data.message.data, "base64");
    const decision = await processInstructionMessage(data, handle);
    if (decision === "nack") {
      return reply.code(500).send({ error: "nack" });
    }
    return reply.code(204).send();
  });
}
