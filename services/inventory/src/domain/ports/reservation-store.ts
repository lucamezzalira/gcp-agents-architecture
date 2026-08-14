import { reservationSchema, type Reservation } from "../reservation.js";

export { reservationSchema, type Reservation };

export type ReservationStore = {
  get(orderId: string): Promise<Reservation | undefined>;
  listHeld(): Promise<Reservation[]>;
  save(reservation: Reservation): Promise<void>;
};
