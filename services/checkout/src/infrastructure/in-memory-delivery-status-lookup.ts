import type { DeliveryStatusLookup } from "../domain/ports/delivery-status-lookup.js";

export class InMemoryDeliveryStatusLookup implements DeliveryStatusLookup {
  private readonly delivered = new Set<string>();

  markDelivered(messageId: string): void {
    this.delivered.add(messageId);
  }

  async wasDelivered(messageId: string): Promise<boolean> {
    return this.delivered.has(messageId);
  }
}
