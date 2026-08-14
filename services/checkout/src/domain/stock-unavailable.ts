export class StockUnavailableError extends Error {
  readonly sku: string;
  readonly needed: number;
  readonly available: number;

  constructor(sku: string, needed: number, available: number) {
    super(`stock unavailable for ${sku}: need ${needed}, have ${available}`);
    this.name = "StockUnavailableError";
    this.sku = sku;
    this.needed = needed;
    this.available = available;
  }
}
