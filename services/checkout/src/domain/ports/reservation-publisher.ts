import type { ReservationCommand } from "../reservation-command.js";

export type { ReservationCommand };

export type ReservationPublisher = {
  publish(command: ReservationCommand): Promise<void>;
};
