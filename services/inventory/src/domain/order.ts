import { z } from "zod";

export const orderStatusSchema = z.enum(["pending", "paid", "cancelled"]);
export const shippingTierSchema = z.enum(["standard", "expedited"]);

export const lineItemSchema = z.object({
  sku: z.string().min(1),
  units: z.number().int().positive(),
  name: z.string().min(1),
});

export const orderSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  status: orderStatusSchema,
  shippingTier: shippingTierSchema.default("standard"),
  lineItems: z.array(lineItemSchema).min(1),
});

export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type ShippingTier = z.infer<typeof shippingTierSchema>;
export type LineItem = z.infer<typeof lineItemSchema>;
export type Order = z.infer<typeof orderSchema>;

export function parseOrderSnapshot(value: unknown): Order | undefined {
  const parsed = orderSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function skuFromOrder(order: Order): string {
  const first = order.lineItems[0];
  if (first === undefined) {
    throw new Error(`order ${order.id} has no line items`);
  }
  return first.sku;
}

export function unitsFromOrder(order: Order): number {
  const first = order.lineItems[0];
  if (first === undefined) {
    throw new Error(`order ${order.id} has no line items`);
  }
  return first.units;
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === "pending" && (to === "paid" || to === "cancelled")) {
    return true;
  }
  return false;
}
