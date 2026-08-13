import type { FastifyInstance } from "fastify";
import type { EmailMessage } from "../domain/email-provider.js";

export type SentReader = () => EmailMessage[];

export function registerSentRoute(
  app: FastifyInstance,
  readSent: SentReader,
): void {
  app.get("/sent", async () => ({ sent: readSent() }));
}
