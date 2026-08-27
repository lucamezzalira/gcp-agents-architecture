import { Firestore } from "@google-cloud/firestore";
import type { HoldAttempt, HoldStock } from "../domain/ports/hold-stock.js";
import type { ReservationStore } from "../domain/ports/reservation-store.js";
import {
  reservationSchema,
  type Reservation,
} from "../domain/ports/reservation-store.js";
import type { StockStore } from "../domain/ports/stock-store.js";
import { stockLevelSchema, type StockLevel } from "../domain/ports/stock-store.js";

export class FirestoreInventory implements StockStore, ReservationStore, HoldStock {
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

  async tryHold(input: {
    orderId: string;
    sku: string;
    units: number;
    reservedAt: string;
  }): Promise<HoldAttempt> {
    return this.db.runTransaction(async (tx) => {
      const reservationRef = this.db.collection("reservations").doc(input.orderId);
      const stockRef = this.db.collection("stock").doc(input.sku);
      const existingSnap = await tx.get(reservationRef);
      if (existingSnap.exists) {
        const parsed = reservationSchema.safeParse(existingSnap.data());
        if (
          parsed.success &&
          (parsed.data.status === "held" || parsed.data.status === "confirmed") &&
          parsed.data.sku === input.sku &&
          parsed.data.units === input.units
        ) {
          return { kind: "already", reservation: parsed.data };
        }
        const stockSnap = await tx.get(stockRef);
        const available = stockSnap.exists
          ? (stockLevelSchema.safeParse(stockSnap.data()).data?.available ?? 0)
          : 0;
        return { kind: "rejected", available };
      }
      const stockSnap = await tx.get(stockRef);
      const available = stockSnap.exists
        ? (stockLevelSchema.safeParse(stockSnap.data()).data?.available ?? 0)
        : 0;
      if (available < input.units) {
        return { kind: "rejected", available };
      }
      const remaining = available - input.units;
      const held: Reservation = {
        orderId: input.orderId,
        sku: input.sku,
        units: input.units,
        status: "held",
        reservedAt: input.reservedAt,
      };
      tx.set(stockRef, { sku: input.sku, available: remaining });
      tx.set(reservationRef, held);
      return { kind: "held", remaining };
    });
  }
}

export function asReservationStore(store: FirestoreInventory): ReservationStore {
  return {
    get: (orderId) => store.getReservation(orderId),
    listHeld: () => store.listHeld(),
    save: (reservation) => store.saveReservation(reservation),
  };
}
