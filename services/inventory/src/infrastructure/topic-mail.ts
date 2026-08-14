import { PubSub } from "@google-cloud/pubsub";
import type { MailPublisher } from "../domain/ports/mail-publisher.js";
import type { SendInstruction } from "../domain/ports/mail-publisher.js";

export class TopicMail implements MailPublisher {
  constructor(private readonly topicName: string) {}

  async publish(instruction: SendInstruction): Promise<void> {
    const topic = new PubSub().topic(this.topicName);
    const bytes = Buffer.from(JSON.stringify(instruction), "utf8");
    await topic.publishMessage({ data: bytes });
  }
}
