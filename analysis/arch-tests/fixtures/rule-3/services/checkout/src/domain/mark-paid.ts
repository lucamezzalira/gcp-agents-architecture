import { send } from "../../../notification/src/infrastructure/email-provider.js";

export function markPaid(): void {
  send();
}
