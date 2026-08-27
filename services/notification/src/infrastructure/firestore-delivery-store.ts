import { Firestore } from "@google-cloud/firestore";
import { PENDING_RECLAIM_AFTER_MS } from "./delivery-timing.js";
import type { DeliveryStore } from "../domain/ports/delivery-store.js";

type DeliveryDoc = {
  status: "pending" | "sent";
  claimedAt: string;
  sentAt?: string;
};

export class FirestoreDeliveryStore implements DeliveryStore {
  constructor(private readonly db: Firestore) {}

  static connect(databaseId: string): FirestoreDeliveryStore {
    return new FirestoreDeliveryStore(new Firestore({ databaseId }));
  }

  async claim(messageId: string): Promise<boolean> {
    const ref = this.db.collection("deliveries").doc(messageId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = new Date();
      if (!snap.exists) {
        const doc: DeliveryDoc = {
          status: "pending",
          claimedAt: now.toISOString(),
        };
        tx.create(ref, doc);
        return true;
      }
      const data = snap.data() as DeliveryDoc | undefined;
      if (data?.status === "sent") {
        return false;
      }
      if (data?.status === "pending") {
        const claimedAt = Date.parse(data.claimedAt);
        if (
          Number.isFinite(claimedAt) &&
          now.getTime() - claimedAt < PENDING_RECLAIM_AFTER_MS
        ) {
          return false;
        }
        tx.set(ref, {
          status: "pending",
          claimedAt: now.toISOString(),
        });
        return true;
      }
      return false;
    });
  }

  async markSent(messageId: string): Promise<void> {
    const ref = this.db.collection("deliveries").doc(messageId);
    await ref.set(
      {
        status: "sent",
        sentAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }

  async release(messageId: string): Promise<void> {
    const ref = this.db.collection("deliveries").doc(messageId);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        return;
      }
      const data = snap.data() as DeliveryDoc | undefined;
      if (data?.status === "pending") {
        tx.delete(ref);
      }
    });
  }

  async hasClaimed(messageId: string): Promise<boolean> {
    const snap = await this.db.collection("deliveries").doc(messageId).get();
    return snap.exists;
  }
}
