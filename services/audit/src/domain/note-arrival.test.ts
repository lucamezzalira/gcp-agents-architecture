import { describe, expect, it } from "vitest";
import { noteArrival } from "./note-arrival.js";
import type { Tape, TapeEntry } from "./ports/tape.js";

class MemoryTape implements Tape {
  readonly rows: TapeEntry[] = [];
  async record(entry: TapeEntry): Promise<void> {
    this.rows.push(entry);
  }
}

describe("noteArrival", () => {
  it("records a send instruction by messageId", async () => {
    const tape = new MemoryTape();
    const kept = await noteArrival(
      { messageId: "msg-1", to: "ops@example.com" },
      tape,
      () => new Date("2026-08-14T12:00:00.000Z"),
    );
    expect(kept).toBe(true);
    expect(tape.rows).toEqual([
      {
        entryId: "msg-1",
        topicHint: "send-instructions",
        recordedAt: "2026-08-14T12:00:00.000Z",
      },
    ]);
  });

  it("ignores a payload with no id", async () => {
    const tape = new MemoryTape();
    expect(await noteArrival({ subject: "hello" }, tape)).toBe(false);
    expect(tape.rows).toEqual([]);
  });
});
