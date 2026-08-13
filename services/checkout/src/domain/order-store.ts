import type { Order } from "./order.js";

export type OrderStore = {
  get(orderId: string): Promise<Order | undefined>;
  save(order: Order): Promise<void>;
};
