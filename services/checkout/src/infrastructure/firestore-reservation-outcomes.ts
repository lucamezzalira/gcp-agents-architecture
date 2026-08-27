import { Firestore } from "@google-cloud/firestore";
import type { ReservationOutcome } from "../domain/ports/reservation-outcome-sink.js";
import type { ReservationOutcomeSink } from "../domain/ports/reservation-outcome-sink.js";

export class FirestoreReservationOutcomes implements ReservationOutcomeSink {
  constructor(private readonly db: Firestore) {}

  static connect(databaseId: string): FirestoreReservationOutcomes {
    return new FirestoreReservationOutcomes(new Firestore({ databaseId }));
  }

  async record(outcome: ReservationOutcome): Promise<void> {
    const id = `${outcome.orderId}:${outcome.sku}:${outcome.result}`;
    const payload = {
      orderId: outcome.orderId,
      result: outcome.result,
      sku: outcome.sku,
      units: outcome.units,
      recordedAt: new Date().toISOString(),
    };
    const batch = this.db.batch();
    batch.set(this.db.collection("reservation-outcomes").doc(id), payload);
    batch.set(
      this.db.collection("reservation-status").doc(outcome.orderId),
      payload,
    );
    await batch.commit();
  }

  async hasReserved(orderId: string): Promise<boolean> {
    const snap = await this.db
      .collection("reservation-status")
      .doc(orderId)
      .get();
    if (!snap.exists) {
      return false;
    }
    const result = snap.get("result");
    return result === "reserved" || result === "confirmed";
  }
}
