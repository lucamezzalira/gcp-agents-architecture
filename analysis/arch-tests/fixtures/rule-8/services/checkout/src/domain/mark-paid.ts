import { save } from "../infrastructure/order-store.js";

export function decide(): void {
  save();
}
