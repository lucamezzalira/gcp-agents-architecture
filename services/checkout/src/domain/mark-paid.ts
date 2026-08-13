import type { BodyStore } from "./body-store.js";
import type { InstructionPublisher } from "./instruction-publisher.js";
import type { Logger } from "./logger.js";
import { InvalidTransitionError } from "./invalid-transition.js";
import { OrderNotFoundError } from "./order-not-found.js";
import type { Order } from "./order.js";
import type { OrderStore } from "./order-store.js";
import { applyTransition } from "./order-transition.js";
import {
  confirmationBodyRef,
  renderConfirmation,
} from "./render-confirmation.js";
import type { SendInstruction } from "./send-instruction.js";

export type MarkPaidResult = { status: "paid"; instruction: SendInstruction };

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
