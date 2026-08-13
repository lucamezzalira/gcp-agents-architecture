import { z } from "zod";

export const orderStatusSchema = z.enum(["pending", "paid"]);

export const orderSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  status: orderStatusSchema,
});

export const createOrderSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
});

export const orderIdParamsSchema = z.object({
  id: z.string().min(1),
});

export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type Order = z.infer<typeof orderSchema>;

export function parseCreateOrder(value: unknown): Order | undefined {
  const parsed = createOrderSchema.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }
  return { ...parsed.data, status: "pending" };
}

export function parseOrderIdParams(value: unknown): string | undefined {
  const parsed = orderIdParamsSchema.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }
  return parsed.data.id;
}
