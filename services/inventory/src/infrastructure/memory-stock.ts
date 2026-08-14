import type { StockStore } from "../domain/ports/stock-store.js";
import type { StockLevel } from "../domain/ports/stock-store.js";

export class MemoryStock implements StockStore {
  private readonly levels = new Map<string, StockLevel>();

  async get(sku: string): Promise<StockLevel | undefined> {
    return this.levels.get(sku);
  }

  async save(level: StockLevel): Promise<void> {
    this.levels.set(level.sku, level);
  }
}
