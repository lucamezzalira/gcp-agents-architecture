import { PubSub } from "@google-cloud/pubsub";
import type { StockReservationPublisher } from "../domain/ports/stock-reservation-publisher.js";
import type { StockCommand } from "../domain/ports/stock-reservation-publisher.js";
import { withProducerSpan } from "./tracing.js";

type TopicHandle = {
  publishMessage(message: {
    json: StockCommand;
    attributes?: Record<string, string>;
  }): Promise<string>;
};

export class PubSubStockReservations implements StockReservationPublisher {
  constructor(private readonly topic: TopicHandle) {}

  static forTopic(topicName: string): PubSubStockReservations {
    return new PubSubStockReservations(new PubSub().topic(topicName));
  }

  async publish(command: StockCommand): Promise<void> {
    await withProducerSpan("pubsub.publish inventory", "inventory", (attributes) =>
      this.topic.publishMessage({ json: command, attributes }),
    );
  }
}
