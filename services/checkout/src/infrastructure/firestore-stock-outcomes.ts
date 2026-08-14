import { Firestore } from "@google-cloud/firestore";
import type { StockOutcome } from "../domain/ports/stock-outcome-sink.js";
import type { StockOutcomeSink } from "../domain/ports/stock-outcome-sink.js";

export class FirestoreStockOutcomes implements StockOutcomeSink {
  constructor(private readonly db: Firestore) {}

  static connect(databaseId: string): FirestoreStockOutcomes {
    return new FirestoreStockOutcomes(new Firestore({ databaseId }));
  }

  async record(outcome: StockOutcome): Promise<void> {
    const id = `${outcome.orderId}:${outcome.sku}:${outcome.result}`;
    await this.db.collection("stock-outcomes").doc(id).set({
      orderId: outcome.orderId,
      result: outcome.result,
      sku: outcome.sku,
      units: outcome.units,
      recordedAt: new Date().toISOString(),
    });
  }
}
