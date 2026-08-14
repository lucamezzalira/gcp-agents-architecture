import { cancelOrder } from "../domain/cancel-order.js";

export function save(): void {
  cancelOrder();
}
