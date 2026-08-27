import type { FastifyInstance } from "fastify";
import type { EmailMessage } from "../domain/ports/email-provider.js";
import type { Logger } from "@observability/runtime";

export type SentReader = () => EmailMessage[];

/**
 * Process-local view of emails this instance recorded (in-memory / stub provider).
 * Not durable across instances or restarts.
 */
export function registerSentRoute(
  app: FastifyInstance,
  readSent: SentReader,
  logger: Logger,
): void {
  app.get("/sent", async () => {
    logger.withCorrelation("sent").info("sent.listed");
    return { sent: readSent() };
  });
}
