import type { FastifyInstance } from "fastify";
import { BodyNotFoundError } from "../domain/body-not-found.js";
import type { DeliverResult } from "../domain/deliver.js";
import type { Logger } from "@observability/runtime";
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
  logger: Logger,
): void {
  app.post("/instructions", async (request, reply) => {
    const instruction = parseSendInstruction(request.body);
    if (instruction === undefined) {
      logger.withCorrelation("unparsed").warn("instruction.invalid");
      return reply.code(400).send({ error: "invalid instruction" });
    }
    const log = logger.withCorrelation(instruction.messageId);
    log.info("instruction.received");
    try {
      const result = await handle(instruction);
      log.info("instruction.completed", { status: result.status });
      return reply.code(200).send(result);
    } catch (error: unknown) {
      if (error instanceof BodyNotFoundError) {
        log.warn("instruction.body-missing");
        return reply
          .code(404)
          .send({ error: "body not found", bodyRef: error.bodyRef });
      }
      log.error("instruction.failed");
      throw error;
    }
  });
}
