import { PubSub } from "@google-cloud/pubsub";
import type { OutcomePublisher } from "../domain/ports/outcome-publisher.js";
import type { ReservationOutcome } from "../domain/ports/outcome-publisher.js";
import { withProducerSpan } from "./tracing.js";

type TopicHandle = {
  publishMessage(message: {
    json: ReservationOutcome;
    attributes?: Record<string, string>;
  }): Promise<string>;
};

export class PubSubOutcomes implements OutcomePublisher {
  constructor(private readonly topic: TopicHandle) {}

  static forTopic(topicName: string): PubSubOutcomes {
    return new PubSubOutcomes(new PubSub().topic(topicName));
  }

  async publish(outcome: ReservationOutcome): Promise<void> {
    await withProducerSpan("pubsub.publish checkout", "checkout", (attributes) =>
      this.topic.publishMessage({ json: outcome, attributes }),
    );
  }
}
