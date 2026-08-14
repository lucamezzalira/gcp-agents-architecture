import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withPubSubConsume } from "@observability/runtime";
import { noteArrival } from "../domain/note-arrival.js";
import type { Tape } from "../domain/ports/tape.js";

const pushBody = z.object({
  message: z.object({
    data: z.string(),
    attributes: z.record(z.string()).optional(),
    messageId: z.string().optional(),
  }),
});

function decodeData(raw: string): unknown {
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return undefined;
  }
}

export function mountIntake(app: FastifyInstance, tape: Tape): void {
  app.post("/intake", async (request, reply) => {
    return withPubSubConsume(request, "audit", async () => {
      const parsed = pushBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "bad envelope" });
      }
      await noteArrival(decodeData(parsed.data.message.data), tape);
      return reply.code(204).send();
    });
  });
}
