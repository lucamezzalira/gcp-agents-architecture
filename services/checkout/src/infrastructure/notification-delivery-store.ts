import { FirestoreDeliveryStore } from "../../../notification/src/infrastructure/firestore-delivery-store.js";
import type { DeliveryStatusLookup } from "../domain/delivery-status-lookup.js";

export class NotificationDeliveryLookup implements DeliveryStatusLookup {
  constructor(private readonly store: FirestoreDeliveryStore) {}

  static connect(databaseId: string): NotificationDeliveryLookup {
    return new NotificationDeliveryLookup(
      FirestoreDeliveryStore.connect(databaseId),
    );
  }

  async wasDelivered(messageId: string): Promise<boolean> {
    return this.store.hasClaimed(messageId);
  }
}
