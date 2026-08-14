import type { Tape, TapeEntry } from "../domain/ports/tape.js";

export class MemoryTape implements Tape {
  readonly rows: TapeEntry[] = [];

  async record(entry: TapeEntry): Promise<void> {
    this.rows.push(entry);
  }
}
