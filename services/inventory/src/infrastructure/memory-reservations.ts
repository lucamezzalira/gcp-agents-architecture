import type { ReservationStore } from "../domain/ports/reservation-store.js";
import type { Reservation } from "../domain/ports/reservation-store.js";

export class MemoryReservations implements ReservationStore {
  private readonly rows = new Map<string, Reservation>();

  async get(orderId: string): Promise<Reservation | undefined> {
    return this.rows.get(orderId);
  }

  async listHeld(): Promise<Reservation[]> {
    return [...this.rows.values()].filter((row) => row.status === "held");
  }

  async save(reservation: Reservation): Promise<void> {
    this.rows.set(reservation.orderId, reservation);
  }
}
