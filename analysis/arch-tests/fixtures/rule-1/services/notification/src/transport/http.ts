import { send } from "../infrastructure/email-provider.js";

export function listen(): void {
  send();
}
