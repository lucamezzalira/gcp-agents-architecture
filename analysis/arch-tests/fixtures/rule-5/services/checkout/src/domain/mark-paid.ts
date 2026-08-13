import { deliver } from "../../../notification/src/domain/deliver.js";

export function pay(): void {
  deliver();
}
