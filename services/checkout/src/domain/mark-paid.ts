import type { BodyStore } from "./body-store.js";
import { confirmationMessageId } from "./get-order-view.js";
import type { InstructionPublisher } from "./instruction-publisher.js";
import type { Logger } from "./logger.js";
import type { Mailer } from "./mailer.js";
import { InvalidTransitionError } from "./invalid-transition.js";
import { OrderNotFoundError } from "./order-not-found.js";
import type { Order } from "./order.js";
import type { OrderStore } from "./order-store.js";
import { applyTransition } from "./order-transition.js";
import {
  confirmationBodyRef,
  renderConfirmation,
} from "./render-confirmation.js";
import { renderExpeditedConfirmation } from "./render-expedited-confirmation.js";
import type { SendInstruction } from "./send-instruction.js";

export type MarkPaidResult = {
  status: "paid";
  dispatch: "queued" | "direct";
  instruction?: SendInstruction;
};

export type MarkPaidDeps = {
  orderStore: OrderStore;
  bodyStore: BodyStore;
  publisher: InstructionPublisher;
  mailer: Mailer;
  logger: Logger;
};

function confirmationHtml(order: Order): string {
  if (order.shippingTier === "expedited") {
    return renderExpeditedConfirmation(order);
  }
  return renderConfirmation(order);
}

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

  let paid: Order;
  try {
    paid = applyTransition(order, "paid");
  } catch (error: unknown) {
    if (error instanceof InvalidTransitionError) {
      log.warn("mark-paid.invalid-transition", {
        from: error.from,
        to: error.to,
      });
    }
    throw error;
  }
  await deps.orderStore.save(paid);
  log.info("mark-paid.paid", { shippingTier: paid.shippingTier });

  const html = confirmationHtml(paid);
  const bodyRef = confirmationBodyRef(paid.id);
  await deps.bodyStore.put(bodyRef, html);

  if (paid.shippingTier === "expedited") {
    // Expedited customers should not wait behind the notification queue.
    await deps.mailer.send({
      to: paid.email,
      subject: `Order ${paid.id} confirmed`,
      html,
    });
    log.info("confirmation.sent-direct");
    return { status: "paid", dispatch: "direct" };
  }

  const instruction: SendInstruction = {
    messageId: confirmationMessageId(paid.id),
    to: paid.email,
    subject: `Order ${paid.id} confirmed`,
    bodyRef,
  };
  await deps.publisher.publish(instruction);
  log.info("instruction.published");
  return { status: "paid", dispatch: "queued", instruction };
}
