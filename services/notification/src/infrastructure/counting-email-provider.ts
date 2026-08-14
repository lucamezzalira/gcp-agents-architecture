import type { EmailMessage, EmailProvider } from "../domain/ports/email-provider.js";

export class CountingEmailProvider implements EmailProvider {
  constructor(
    private readonly inner: EmailProvider,
    private readonly record: (
      outcome: "delivered" | "failed",
      attempts: number,
    ) => void,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.inner.send(message);
      this.record("delivered", 1);
    } catch (error: unknown) {
      this.record("failed", 1);
      throw error;
    }
  }
}
