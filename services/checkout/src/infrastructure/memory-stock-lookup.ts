import type { StockLookup } from "../domain/ports/stock-lookup.js";

export class MemoryStockLookup implements StockLookup {
  constructor(private readonly levels = new Map<string, number>()) {}

  set(sku: string, available: number): void {
    this.levels.set(sku, available);
  }

  async available(sku: string): Promise<number> {
    return this.levels.get(sku) ?? 0;
  }
}
