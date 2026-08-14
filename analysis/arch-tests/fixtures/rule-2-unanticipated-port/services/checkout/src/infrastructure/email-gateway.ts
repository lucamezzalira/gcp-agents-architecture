import type { EmailGateway } from "../domain/ports/email-gateway.js";

export function createGateway(): EmailGateway {
  return { send() {} };
}
