import { PubSub } from "@google-cloud/pubsub";
import type { InstructionPublisher } from "../domain/ports/instruction-publisher.js";
import type { SendInstruction } from "../domain/ports/instruction-publisher.js";
import { withProducerSpan } from "./tracing.js";

export type PublishableTopic = {
  publishMessage(message: {
    json: SendInstruction;
    attributes?: Record<string, string>;
  }): Promise<string>;
};

export class PubSubInstructionPublisher implements InstructionPublisher {
  constructor(private readonly topic: PublishableTopic) {}

  static fromTopicName(topicName: string): PubSubInstructionPublisher {
    return new PubSubInstructionPublisher(new PubSub().topic(topicName));
  }

  async publish(instruction: SendInstruction): Promise<void> {
    await withProducerSpan("pubsub.publish notification", "notification", (attributes) =>
      this.topic.publishMessage({ json: instruction, attributes }),
    );
  }
}
