import type { StockCommand } from "../stock-command.js";

export type { StockCommand };

export type StockReservationPublisher = {
  publish(command: StockCommand): Promise<void>;
};
