export class InsufficientStockError extends Error {
  readonly sku: string;
  readonly requested: number;
  readonly available: number;

  constructor(sku: string, requested: number, available: number) {
    super(`insufficient stock for ${sku}: asked ${requested}, have ${available}`);
    this.name = "InsufficientStockError";
    this.sku = sku;
    this.requested = requested;
    this.available = available;
  }
}
