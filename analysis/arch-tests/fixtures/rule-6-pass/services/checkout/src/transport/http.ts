import { decide } from "../domain/mark-paid.js";

export function listen(): void {
  decide();
}
