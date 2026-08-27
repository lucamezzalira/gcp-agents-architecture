import type { ReservationPublisher } from "../domain/ports/reservation-publisher.js";
import type { ReservationCommand } from "../domain/ports/reservation-publisher.js";
import type { ReservationOutcomeSink } from "../domain/ports/reservation-outcome-sink.js";

/**
 * In-process publisher for tests and local mode. When an outcome sink is
 * provided, reserve/release/confirm are applied immediately so local checkout
 * can pay without inventory or Pub/Sub. This is a local shortcut, not cloud
 * behavior: cloud place publishes a command and pay waits for the outcome push
 * (409 reservation not ready until then).
 */
export class MemoryReservationPublisher implements ReservationPublisher {
  readonly published: ReservationCommand[] = [];

  constructor(private readonly outcomes?: ReservationOutcomeSink) {}

  async publish(command: ReservationCommand): Promise<void> {
    this.published.push(command);
    if (this.outcomes === undefined) {
      return;
    }
    if (command.action === "reserve") {
      await this.outcomes.record({
        orderId: command.orderId,
        result: "reserved",
        sku: command.sku,
        units: command.units,
      });
      return;
    }
    if (command.action === "release") {
      await this.outcomes.record({
        orderId: command.orderId,
        result: "released",
        sku: command.sku,
        units: command.units,
      });
      return;
    }
    await this.outcomes.record({
      orderId: command.orderId,
      result: "confirmed",
      sku: command.sku,
      units: command.units,
    });
  }
}
