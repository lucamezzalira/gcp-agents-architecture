import { Firestore } from "@google-cloud/firestore";
import type { Order } from "../domain/ports/order-store.js";
import { orderSchema } from "../domain/ports/order-store.js";
import type { OrderStore } from "../domain/ports/order-store.js";

export class FirestoreOrderStore implements OrderStore {
  constructor(private readonly db: Firestore) {}

  static connect(databaseId: string): FirestoreOrderStore {
    return new FirestoreOrderStore(new Firestore({ databaseId }));
  }

  async get(orderId: string): Promise<Order | undefined> {
    const snap = await this.db.collection("orders").doc(orderId).get();
    if (!snap.exists) {
      return undefined;
    }
    const parsed = orderSchema.safeParse(snap.data());
    if (!parsed.success) {
      return undefined;
    }
    return parsed.data;
  }

  async list(): Promise<Order[]> {
    const snap = await this.db.collection("orders").get();
    const orders: Order[] = [];
    for (const doc of snap.docs) {
      const parsed = orderSchema.safeParse(doc.data());
      if (parsed.success) {
        orders.push(parsed.data);
      }
    }
    return orders;
  }

  async save(order: Order): Promise<void> {
    await this.db.collection("orders").doc(order.id).set(order);
  }
}
