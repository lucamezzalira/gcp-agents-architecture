import { PENDING_RECLAIM_AFTER_MS } from "./delivery-timing.js";
import type { DeliveryStore } from "../domain/ports/delivery-store.js";

type DeliveryStatus = "pending" | "sent";

type Entry = {
  status: DeliveryStatus;
  claimedAtMs: number;
};

export class InMemoryDeliveryStore implements DeliveryStore {
  private readonly entries = new Map<string, Entry>();

  async claim(messageId: string): Promise<boolean> {
    const current = this.entries.get(messageId);
    const now = Date.now();
    if (current?.status === "sent") {
      return false;
    }
    if (current?.status === "pending") {
      if (now - current.claimedAtMs < PENDING_RECLAIM_AFTER_MS) {
        return false;
      }
      this.entries.set(messageId, { status: "pending", claimedAtMs: now });
      return true;
    }
    this.entries.set(messageId, { status: "pending", claimedAtMs: now });
    return true;
  }

  async markSent(messageId: string): Promise<void> {
    this.entries.set(messageId, {
      status: "sent",
      claimedAtMs: this.entries.get(messageId)?.claimedAtMs ?? Date.now(),
    });
  }

  async release(messageId: string): Promise<void> {
    if (this.entries.get(messageId)?.status === "pending") {
      this.entries.delete(messageId);
    }
  }

  hasClaimed(messageId: string): boolean {
    return this.entries.has(messageId);
  }

  statusOf(messageId: string): DeliveryStatus | undefined {
    return this.entries.get(messageId)?.status;
  }
}
