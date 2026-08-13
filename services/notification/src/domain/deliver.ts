import type { BodyStore } from "./body-store.js";
import { BodyNotFoundError } from "./body-not-found.js";
import type { DeliveryStore } from "./delivery-store.js";
import type { EmailProvider } from "./email-provider.js";
import type { SendInstruction } from "./send-instruction.js";

export type DeliverResult = {
  status: "sent" | "duplicate";
};

export type DeliverDeps = {
  bodyStore: BodyStore;
  deliveryStore: DeliveryStore;
  emailProvider: EmailProvider;
};

export async function deliver(
  instruction: SendInstruction,
  deps: DeliverDeps,
): Promise<DeliverResult> {
  const html = await deps.bodyStore.get(instruction.bodyRef);
  if (html === undefined) {
    throw new BodyNotFoundError(instruction.bodyRef);
  }

  const claimed = await deps.deliveryStore.claim(instruction.messageId);
  if (!claimed) {
    return { status: "duplicate" };
  }

  await deps.emailProvider.send({
    to: instruction.to,
    subject: instruction.subject,
    html,
  });
  return { status: "sent" };
}
