import type { ReservationOutcome } from "../domain/ports/reservation-outcome-sink.js";
import type { ReservationOutcomeSink } from "../domain/ports/reservation-outcome-sink.js";

export class MemoryReservationOutcomes implements ReservationOutcomeSink {
  readonly recorded: ReservationOutcome[] = [];

  async record(outcome: ReservationOutcome): Promise<void> {
    this.recorded.push(outcome);
  }

  async hasReserved(orderId: string): Promise<boolean> {
    const latest = [...this.recorded]
      .reverse()
      .find((item) => item.orderId === orderId);
    return latest?.result === "reserved" || latest?.result === "confirmed";
  }
}
