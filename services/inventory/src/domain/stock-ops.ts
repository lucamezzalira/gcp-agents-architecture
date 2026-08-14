import { z } from "zod";
import type { StockStore } from "./ports/stock-store.js";
import type { StockLevel } from "./stock.js";

export const putStockSchema = z.object({
  sku: z.string().min(1),
  available: z.number().int().nonnegative(),
});

export async function putStock(
  value: unknown,
  store: StockStore,
): Promise<StockLevel | undefined> {
  const parsed = putStockSchema.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }
  await store.save(parsed.data);
  return parsed.data;
}

export async function getStock(
  sku: string,
  store: StockStore,
): Promise<StockLevel | undefined> {
  return store.get(sku);
}
