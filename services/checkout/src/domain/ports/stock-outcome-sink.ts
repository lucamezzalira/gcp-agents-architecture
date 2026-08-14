import type { StockOutcome } from "../stock-outcome.js";

export type { StockOutcome };

export type StockOutcomeSink = {
  record(outcome: StockOutcome): Promise<void>;
};
