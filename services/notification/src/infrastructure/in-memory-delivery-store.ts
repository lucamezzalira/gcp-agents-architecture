import type { DeliveryStore } from "../domain/delivery-store.js";

export class InMemoryDeliveryStore implements DeliveryStore {
  private readonly delivered = new Set<string>();

  async hasBeenDelivered(messageId: string): Promise<boolean> {
    return this.delivered.has(messageId);
  }

  async record(messageId: string): Promise<void> {
    this.delivered.add(messageId);
  }
}
