import { orderSchema, type Order } from "../order.js";

export { orderSchema, type Order };

export type OrderStore = {
  get(orderId: string): Promise<Order | undefined>;
  list(): Promise<Order[]>;
  save(order: Order): Promise<void>;
};
