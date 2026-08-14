import type { OrderStore } from "../domain/ports/order-store.js";

export function createStore(): OrderStore {
  return { save() {} };
}
