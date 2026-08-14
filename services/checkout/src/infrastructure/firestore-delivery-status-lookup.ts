import { Firestore } from "@google-cloud/firestore";
import type { DeliveryStatusLookup } from "../domain/ports/delivery-status-lookup.js";

export class FirestoreDeliveryStatusLookup implements DeliveryStatusLookup {
  constructor(private readonly db: Firestore) {}

  static connect(databaseId: string): FirestoreDeliveryStatusLookup {
    return new FirestoreDeliveryStatusLookup(new Firestore({ databaseId }));
  }

  async wasDelivered(messageId: string): Promise<boolean> {
    const snap = await this.db.collection("delivery-status").doc(messageId).get();
    return snap.exists;
  }

  async markDelivered(messageId: string): Promise<void> {
    await this.db.collection("delivery-status").doc(messageId).set({
      delivered: true,
      recordedAt: new Date().toISOString(),
    });
  }
}
