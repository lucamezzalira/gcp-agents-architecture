import type { OrderStore } from "../domain/order-store.js";

export function createStore(): OrderStore {
  return { save() {} };
}
