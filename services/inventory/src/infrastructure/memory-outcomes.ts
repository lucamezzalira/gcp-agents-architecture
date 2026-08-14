import type { OutcomePublisher } from "../domain/ports/outcome-publisher.js";
import type { ReservationOutcome } from "../domain/ports/outcome-publisher.js";

export class MemoryOutcomes implements OutcomePublisher {
  readonly published: ReservationOutcome[] = [];

  async publish(outcome: ReservationOutcome): Promise<void> {
    this.published.push(outcome);
  }
}
