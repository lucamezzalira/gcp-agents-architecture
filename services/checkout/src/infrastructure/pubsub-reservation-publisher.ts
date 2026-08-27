import { PubSub } from "@google-cloud/pubsub";
import type { ReservationPublisher } from "../domain/ports/reservation-publisher.js";
import type { ReservationCommand } from "../domain/ports/reservation-publisher.js";
import { withProducerSpan } from "@observability/runtime";

type TopicHandle = {
  publishMessage(message: {
    json: ReservationCommand;
    attributes?: Record<string, string>;
  }): Promise<string>;
};

export class PubSubReservationPublisher implements ReservationPublisher {
  constructor(private readonly topic: TopicHandle) {}

  static forTopic(topicName: string): PubSubReservationPublisher {
    return new PubSubReservationPublisher(new PubSub().topic(topicName));
  }

  async publish(command: ReservationCommand): Promise<void> {
    await withProducerSpan("pubsub.publish inventory", "inventory", (attributes) =>
      this.topic.publishMessage({ json: command, attributes }),
    );
  }
}
