import type { HtmlStore } from "./ports/html-store.js";
import type { MailPublisher } from "./ports/mail-publisher.js";
import { lowStockBodyRef, renderLowStock } from "./render-low-stock.js";
import type { SendInstruction } from "./send-instruction.js";

export const LOW_STOCK_THRESHOLD = 5;
export const OPS_INBOX = "ops@example.com";

export type LowStockMailer = {
  html: HtmlStore;
  mailer: MailPublisher;
};

export async function alertLowStock(
  sku: string,
  remaining: number,
  mailer: LowStockMailer,
  at: Date,
): Promise<SendInstruction | undefined> {
  if (remaining >= LOW_STOCK_THRESHOLD) {
    return undefined;
  }
  const stamp = at.toISOString().replaceAll(":", "").replaceAll(".", "");
  const bodyRef = lowStockBodyRef(sku, stamp);
  await mailer.html.put(bodyRef, renderLowStock(sku, remaining));
  const instruction: SendInstruction = {
    messageId: `low-stock-${sku}-${stamp}`,
    to: OPS_INBOX,
    subject: `Low stock: ${sku} (${remaining} left)`,
    bodyRef,
  };
  await mailer.mailer.publish(instruction);
  return instruction;
}
