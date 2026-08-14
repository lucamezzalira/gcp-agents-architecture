import { z } from "zod";
import type { StockLookup } from "../domain/ports/stock-lookup.js";

const levelSchema = z.object({
  sku: z.string().min(1),
  available: z.number().int().nonnegative(),
});

export class HttpStockLookup implements StockLookup {
  constructor(private readonly inventoryBaseUrl: string) {}

  async available(sku: string): Promise<number> {
    const url = `${this.inventoryBaseUrl.replace(/\/$/, "")}/stock/${encodeURIComponent(sku)}`;
    const response = await fetch(url);
    if (response.status === 404) {
      return 0;
    }
    if (!response.ok) {
      throw new Error(`inventory stock lookup failed: ${response.status}`);
    }
    const parsed = levelSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error("inventory stock lookup returned an invalid body");
    }
    return parsed.data.available;
  }
}
