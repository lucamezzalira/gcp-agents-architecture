import type { EmailMessage, EmailProvider } from "../domain/ports/email-provider.js";

/**
 * Stub provider: records the call and logs. Does not talk to a real email API.
 */
export class LoggingEmailProvider implements EmailProvider {
  readonly calls: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.calls.push(message);
    console.log(
      JSON.stringify({
        event: "email.stubbed",
        to: message.to,
        subject: message.subject,
      }),
    );
  }
}
