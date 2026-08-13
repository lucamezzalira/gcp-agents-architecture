import { markPaid } from "../domain/mark-paid.js";

export function save(): void {
  markPaid();
}
