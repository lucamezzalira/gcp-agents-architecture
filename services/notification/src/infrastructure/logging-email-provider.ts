import type { EmailMessage, EmailProvider } from "../domain/email-provider.js";

export class LoggingEmailProvider implements EmailProvider {
  readonly calls: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.calls.push(message);
    console.log(
      JSON.stringify({
        event: "email.sent",
        to: message.to,
        subject: message.subject,
      }),
    );
  }
}
