import { z } from "zod";

export const orderStatusSchema = z.enum(["pending", "paid", "cancelled"]);
export const shippingTierSchema = z.enum(["standard", "expedited"]);

export const orderSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  status: orderStatusSchema,
  shippingTier: shippingTierSchema.default("standard"),
});

export const createOrderSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  shippingTier: shippingTierSchema.optional(),
});

export const orderIdParamsSchema = z.object({
  id: z.string().min(1),
});

export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type ShippingTier = z.infer<typeof shippingTierSchema>;
export type Order = z.infer<typeof orderSchema>;

export function parseCreateOrder(value: unknown): Order | undefined {
  const parsed = createOrderSchema.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }
  return {
    id: parsed.data.id,
    email: parsed.data.email,
    status: "pending",
    shippingTier: parsed.data.shippingTier ?? "standard",
  };
}

export function parseOrderIdParams(value: unknown): string | undefined {
  const parsed = orderIdParamsSchema.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }
  return parsed.data.id;
}
