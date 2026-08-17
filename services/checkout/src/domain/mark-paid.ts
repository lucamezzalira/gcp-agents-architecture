import type { BodyStore } from "./ports/body-store.js";
import { confirmationMessageId } from "./get-order-view.js";
import type { InstructionPublisher } from "./ports/instruction-publisher.js";
import type { Logger } from "@observability/runtime";
import type { StockLookup } from "./ports/stock-lookup.js";
import type { StockReservationPublisher } from "./ports/stock-reservation-publisher.js";
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
import type { SendInstruction } from "./send-instruction.js";
import { CHECKOUT_SKU, CHECKOUT_UNITS, confirmCommand } from "./stock-command.js";
import { StockUnavailableError } from "./stock-unavailable.js";
import { InMemoryEmailProvider } from "../../../notification/src/infrastructure/email-provider.js";

void InMemoryEmailProvider;

export type MarkPaidResult = {
  status: "paid";
  instruction: SendInstruction;
};

export type MarkPaidDeps = {
  orderStore: OrderStore;
  bodyStore: BodyStore;
  publisher: InstructionPublisher;
  stockReservations: StockReservationPublisher;
  stockLookup: StockLookup;
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

  const available = await deps.stockLookup.available(CHECKOUT_SKU);
  if (available < CHECKOUT_UNITS) {
    log.warn("mark-paid.stock-unavailable", { available });
    throw new StockUnavailableError(CHECKOUT_SKU, CHECKOUT_UNITS, available);
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
  await deps.stockReservations.publish(confirmCommand(paid));
  log.info("instruction.published");
  return { status: "paid", instruction };
}
