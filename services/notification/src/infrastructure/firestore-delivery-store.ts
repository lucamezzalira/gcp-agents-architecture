import { Firestore } from "@google-cloud/firestore";
import type { DeliveryStore } from "../domain/delivery-store.js";

export class FirestoreDeliveryStore implements DeliveryStore {
  constructor(private readonly db: Firestore) {}

  static connect(databaseId: string): FirestoreDeliveryStore {
    return new FirestoreDeliveryStore(new Firestore({ databaseId }));
  }

  async claim(messageId: string): Promise<boolean> {
    const ref = this.db.collection("deliveries").doc(messageId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        return false;
      }
      tx.create(ref, { claimedAt: new Date().toISOString() });
      return true;
    });
  }

  async hasClaimed(messageId: string): Promise<boolean> {
    const snap = await this.db.collection("deliveries").doc(messageId).get();
    return snap.exists;
  }
}
