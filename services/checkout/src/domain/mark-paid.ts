import type { BodyStore } from "./ports/body-store.js";
import { confirmationMessageId } from "./get-order-view.js";
import type { InstructionPublisher } from "./ports/instruction-publisher.js";
import type { Logger } from "@observability/runtime";
import type { ReservationOutcomeSink } from "./ports/reservation-outcome-sink.js";
import type { ReservationPublisher } from "./ports/reservation-publisher.js";
import { InvalidTransitionError } from "./invalid-transition.js";
import { OrderNotFoundError } from "./order-not-found.js";
import type { Order } from "./order.js";
import type { OrderStore } from "./ports/order-store.js";
import { applyTransition } from "./order-transition.js";
import {
  confirmationBodyRef,
  renderConfirmation,
} from "./render-confirmation.js";
import { renderExpeditedConfirmation } from "./render-expedited-confirmation.js";
import { ReservationNotReadyError } from "./reservation-not-ready.js";
import type { SendInstruction } from "./send-instruction.js";
import {
  CHECKOUT_SKU,
  CHECKOUT_UNITS,
  confirmCommand,
} from "./reservation-command.js";

export type MarkPaidResult = {
  status: "paid";
  instruction: SendInstruction;
};

export type MarkPaidDeps = {
  orderStore: OrderStore;
  bodyStore: BodyStore;
  publisher: InstructionPublisher;
  reservations: ReservationPublisher;
  reservationOutcomes: ReservationOutcomeSink;
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

  const reserved = await deps.reservationOutcomes.hasReserved(orderId);
  if (!reserved) {
    log.warn("mark-paid.reservation-not-ready");
    throw new ReservationNotReadyError(orderId);
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

  const instruction: SendInstruction = {
    messageId: confirmationMessageId(paid.id),
    to: paid.email,
    subject: `Order ${paid.id} confirmed`,
    bodyRef,
  };
  await deps.publisher.publish(instruction);
  await deps.reservations.publish(confirmCommand(paid));
  log.info("instruction.published");
  return { status: "paid", instruction };
}

export { CHECKOUT_SKU, CHECKOUT_UNITS };
