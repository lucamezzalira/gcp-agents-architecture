import { Firestore } from "@google-cloud/firestore";
import type { Tape, TapeEntry } from "../domain/ports/tape.js";

export class FirestoreTape implements Tape {
  constructor(private readonly db: Firestore) {}

  static connect(databaseId: string): FirestoreTape {
    return new FirestoreTape(new Firestore({ databaseId }));
  }

  async record(entry: TapeEntry): Promise<void> {
    await this.db.collection("tape").doc(entry.entryId).set(entry);
  }
}
