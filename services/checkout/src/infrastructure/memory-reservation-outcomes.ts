import {
  canAdvanceOutcome,
  isPayReady,
} from "../domain/ports/reservation-outcome-sink.js";
import type { ReservationOutcome } from "../domain/ports/reservation-outcome-sink.js";
import type { ReservationOutcomeSink } from "../domain/ports/reservation-outcome-sink.js";

export class MemoryReservationOutcomes implements ReservationOutcomeSink {
  readonly recorded: ReservationOutcome[] = [];
  private readonly status = new Map<string, ReservationOutcome["result"]>();

  async record(outcome: ReservationOutcome): Promise<void> {
    this.recorded.push(outcome);
    const from = this.status.get(outcome.orderId);
    if (canAdvanceOutcome(from, outcome.result)) {
      this.status.set(outcome.orderId, outcome.result);
    }
  }

  async hasReserved(orderId: string): Promise<boolean> {
    return isPayReady(this.status.get(orderId));
  }
}
