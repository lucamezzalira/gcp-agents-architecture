import { z } from "zod";

export const stockLevelSchema = z.object({
  sku: z.string().min(1),
  available: z.number().int().nonnegative(),
});

export type StockLevel = z.infer<typeof stockLevelSchema>;

export const DEFAULT_SKU = "standard-item";
