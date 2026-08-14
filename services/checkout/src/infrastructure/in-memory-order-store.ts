import type { OrderStore } from "../domain/ports/order-store.js";
import type { Order } from "../domain/ports/order-store.js";

export class InMemoryOrderStore implements OrderStore {
  private readonly orders = new Map<string, Order>();

  async get(orderId: string): Promise<Order | undefined> {
    return this.orders.get(orderId);
  }

  async list(): Promise<Order[]> {
    return [...this.orders.values()];
  }

  async save(order: Order): Promise<void> {
    this.orders.set(order.id, order);
  }
}
