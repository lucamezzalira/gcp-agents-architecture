import type { EmailMessage, EmailProvider } from "../domain/email-provider.js";

export class InMemoryEmailProvider implements EmailProvider {
  readonly calls: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.calls.push(message);
  }
}
