import type { MailPublisher } from "../domain/ports/mail-publisher.js";
import type { SendInstruction } from "../domain/ports/mail-publisher.js";

export class MemoryMail implements MailPublisher {
  readonly sent: SendInstruction[] = [];

  async publish(instruction: SendInstruction): Promise<void> {
    this.sent.push(instruction);
  }
}
