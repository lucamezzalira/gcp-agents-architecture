import type { StockOutcomeSink } from "../domain/ports/stock-outcome-sink.js";
import type { StockOutcome } from "../domain/ports/stock-outcome-sink.js";

export class MemoryStockOutcomes implements StockOutcomeSink {
  readonly recorded: StockOutcome[] = [];

  async record(outcome: StockOutcome): Promise<void> {
    this.recorded.push(outcome);
  }
}
