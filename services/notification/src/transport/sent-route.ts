import type { FastifyInstance } from "fastify";
import type { EmailMessage } from "../domain/ports/email-provider.js";
import type { Logger } from "@observability/runtime";

export type SentReader = () => EmailMessage[];

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
