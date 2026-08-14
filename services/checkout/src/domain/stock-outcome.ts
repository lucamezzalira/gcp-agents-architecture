import { z } from "zod";

const outcomeSchema = z.object({
  orderId: z.string().min(1),
  result: z.enum(["reserved", "rejected", "released", "confirmed", "expired"]),
  sku: z.string().min(1),
  units: z.number().int().nonnegative(),
});

export type StockOutcome = z.infer<typeof outcomeSchema>;

export function parseStockOutcome(value: unknown): StockOutcome | undefined {
  const parsed = outcomeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
