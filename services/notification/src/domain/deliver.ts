import type { BodyStore } from "./ports/body-store.js";
import { BodyNotFoundError } from "./body-not-found.js";
import type { DeliveryStore } from "./ports/delivery-store.js";
import type { EmailProvider } from "./ports/email-provider.js";
import type { Logger } from "@observability/runtime";
import type { SendInstruction } from "./send-instruction.js";

export type DeliverResult = {
  status: "sent" | "duplicate";
};

export type DeliverDeps = {
  bodyStore: BodyStore;
  deliveryStore: DeliveryStore;
  emailProvider: EmailProvider;
  logger: Logger;
};

export async function deliver(
  instruction: SendInstruction,
  deps: DeliverDeps,
): Promise<DeliverResult> {
  const log = deps.logger.withCorrelation(instruction.messageId);
  log.info("deliver.started");

  const html = await deps.bodyStore.get(instruction.bodyRef);
  if (html === undefined) {
    log.warn("deliver.body-missing");
    throw new BodyNotFoundError(instruction.bodyRef);
  }

  const claimed = await deps.deliveryStore.claim(instruction.messageId);
  if (!claimed) {
    log.info("deliver.duplicate");
    return { status: "duplicate" };
  }

  log.info("deliver.sending");
  await deps.emailProvider.send({
    to: instruction.to,
    subject: instruction.subject,
    html,
  });
  log.info("deliver.sent");
  return { status: "sent" };
}
