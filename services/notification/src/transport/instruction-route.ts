import type { FastifyInstance } from "fastify";
import { BodyNotFoundError } from "../domain/body-not-found.js";
import type { DeliverResult } from "../domain/deliver.js";
import {
  parseSendInstruction,
  type SendInstruction,
} from "../domain/send-instruction.js";

export type InstructionHandler = (
  instruction: SendInstruction,
) => Promise<DeliverResult>;

export function registerInstructionRoute(
  app: FastifyInstance,
  handle: InstructionHandler,
): void {
  app.post("/instructions", async (request, reply) => {
    const instruction = parseSendInstruction(request.body);
    if (instruction === undefined) {
      return reply.code(400).send({ error: "invalid instruction" });
    }
    try {
      const result = await handle(instruction);
      return reply.code(200).send(result);
    } catch (error: unknown) {
      if (error instanceof BodyNotFoundError) {
        return reply
          .code(404)
          .send({ error: "body not found", bodyRef: error.bodyRef });
      }
      throw error;
    }
  });
}
