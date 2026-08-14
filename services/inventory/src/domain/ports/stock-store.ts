import { stockLevelSchema, type StockLevel } from "../stock.js";

export { stockLevelSchema, type StockLevel };

export type StockStore = {
  get(sku: string): Promise<StockLevel | undefined>;
  save(level: StockLevel): Promise<void>;
};
