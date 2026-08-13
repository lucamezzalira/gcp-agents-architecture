import { PubSub } from "@google-cloud/pubsub";
import type { InstructionPublisher } from "../domain/instruction-publisher.js";
import type { SendInstruction } from "../domain/send-instruction.js";

export type PublishableTopic = {
  publishMessage(message: { json: SendInstruction }): Promise<string>;
};

export class PubSubInstructionPublisher implements InstructionPublisher {
  constructor(private readonly topic: PublishableTopic) {}

  static fromTopicName(topicName: string): PubSubInstructionPublisher {
    return new PubSubInstructionPublisher(new PubSub().topic(topicName));
  }

  async publish(instruction: SendInstruction): Promise<void> {
    await this.topic.publishMessage({ json: instruction });
  }
}
