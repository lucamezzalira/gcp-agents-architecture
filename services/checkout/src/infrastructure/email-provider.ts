import type { Mailer, MailerMessage } from "../domain/mailer.js";

export class InMemoryEmailProvider implements Mailer {
  readonly calls: MailerMessage[] = [];

  async send(message: MailerMessage): Promise<void> {
    this.calls.push(message);
  }
}

export class DirectEmailProvider implements Mailer {
  readonly calls: MailerMessage[] = [];

  async send(message: MailerMessage): Promise<void> {
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
