export type StockLookup = {
  available(sku: string): Promise<number>;
};
