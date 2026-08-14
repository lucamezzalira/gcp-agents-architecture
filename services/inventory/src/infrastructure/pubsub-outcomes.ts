import { PubSub } from "@google-cloud/pubsub";
import type { OutcomePublisher } from "../domain/ports/outcome-publisher.js";
import type { ReservationOutcome } from "../domain/ports/outcome-publisher.js";

type TopicHandle = {
  publishMessage(message: { json: ReservationOutcome }): Promise<string>;
};

export class PubSubOutcomes implements OutcomePublisher {
  constructor(private readonly topic: TopicHandle) {}

  static forTopic(topicName: string): PubSubOutcomes {
    return new PubSubOutcomes(new PubSub().topic(topicName));
  }

  async publish(outcome: ReservationOutcome): Promise<void> {
    await this.topic.publishMessage({ json: outcome });
  }
}
