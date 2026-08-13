import type { BodyStore } from "./body-store.js";
import type { InstructionPublisher } from "./instruction-publisher.js";
import type { Logger } from "./logger.js";
import { OrderNotFoundError } from "./order-not-found.js";
import type { OrderStore } from "./order-store.js";
import {
  confirmationBodyRef,
  renderConfirmation,
} from "./render-confirmation.js";
import type { SendInstruction } from "./send-instruction.js";

export type MarkPaidResult =
  | { status: "paid"; instruction: SendInstruction }
  | { status: "already-paid" };

export type MarkPaidDeps = {
  orderStore: OrderStore;
  bodyStore: BodyStore;
  publisher: InstructionPublisher;
  logger: Logger;
};

export async function markPaid(
  orderId: string,
  deps: MarkPaidDeps,
): Promise<MarkPaidResult> {
  const log = deps.logger.withCorrelation(orderId);
  log.info("mark-paid.started");

  const order = await deps.orderStore.get(orderId);
  if (order === undefined) {
    log.warn("mark-paid.not-found");
    throw new OrderNotFoundError(orderId);
  }

  if (order.status === "paid") {
    log.info("mark-paid.already-paid");
    return { status: "already-paid" };
  }

  const paid = { ...order, status: "paid" as const };
  await deps.orderStore.save(paid);
  log.info("mark-paid.paid");

  const html = renderConfirmation(paid);
  const bodyRef = confirmationBodyRef(paid.id);
  await deps.bodyStore.put(bodyRef, html);

  const instruction: SendInstruction = {
    messageId: `checkout:${paid.id}:paid`,
    to: paid.email,
    subject: `Order ${paid.id} confirmed`,
    bodyRef,
  };
  await deps.publisher.publish(instruction);
  log.info("instruction.published");
  return { status: "paid", instruction };
}
