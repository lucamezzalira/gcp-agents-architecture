import type { DeliveryStore } from "../domain/ports/delivery-store.js";

export class InMemoryDeliveryStore implements DeliveryStore {
  private readonly claimed = new Set<string>();

  async claim(messageId: string): Promise<boolean> {
    if (this.claimed.has(messageId)) {
      return false;
    }
    this.claimed.add(messageId);
    return true;
  }

  hasClaimed(messageId: string): boolean {
    return this.claimed.has(messageId);
  }
}
