import { Firestore } from "@google-cloud/firestore";
import type { ReservationStore } from "../domain/ports/reservation-store.js";
import {
  reservationSchema,
  type Reservation,
} from "../domain/ports/reservation-store.js";
import type { StockStore } from "../domain/ports/stock-store.js";
import { stockLevelSchema, type StockLevel } from "../domain/ports/stock-store.js";

export class FirestoreInventory implements StockStore, ReservationStore {
  constructor(private readonly db: Firestore) {}

  static connect(databaseId: string): FirestoreInventory {
    return new FirestoreInventory(new Firestore({ databaseId }));
  }

  async get(sku: string): Promise<StockLevel | undefined> {
    const snap = await this.db.collection("stock").doc(sku).get();
    if (!snap.exists) {
      return undefined;
    }
    const parsed = stockLevelSchema.safeParse(snap.data());
    return parsed.success ? parsed.data : undefined;
  }

  async save(level: StockLevel): Promise<void> {
    await this.db.collection("stock").doc(level.sku).set(level);
  }

  async getReservation(orderId: string): Promise<Reservation | undefined> {
    const snap = await this.db.collection("reservations").doc(orderId).get();
    if (!snap.exists) {
      return undefined;
    }
    const parsed = reservationSchema.safeParse(snap.data());
    return parsed.success ? parsed.data : undefined;
  }

  async listHeld(): Promise<Reservation[]> {
    const snap = await this.db
      .collection("reservations")
      .where("status", "==", "held")
      .get();
    const held: Reservation[] = [];
    for (const doc of snap.docs) {
      const parsed = reservationSchema.safeParse(doc.data());
      if (parsed.success) {
        held.push(parsed.data);
      }
    }
    return held;
  }

  async saveReservation(reservation: Reservation): Promise<void> {
    await this.db.collection("reservations").doc(reservation.orderId).set(reservation);
  }
}

export function asReservationStore(store: FirestoreInventory): ReservationStore {
  return {
    get: (orderId) => store.getReservation(orderId),
    listHeld: () => store.listHeld(),
    save: (reservation) => store.saveReservation(reservation),
  };
}
