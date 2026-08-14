import type { StockReservationPublisher } from "../domain/ports/stock-reservation-publisher.js";
import type { StockCommand } from "../domain/ports/stock-reservation-publisher.js";

export class MemoryStockReservations implements StockReservationPublisher {
  readonly published: StockCommand[] = [];

  async publish(command: StockCommand): Promise<void> {
    this.published.push(command);
  }
}
