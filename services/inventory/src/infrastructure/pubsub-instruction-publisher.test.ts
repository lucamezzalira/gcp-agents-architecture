import { describe, expect, it } from "vitest";
import type { SendInstruction } from "../domain/ports/instruction-publisher.js";
import { PubSubInstructionPublisher } from "./pubsub-instruction-publisher.js";

const instruction: SendInstruction = {
  messageId: "inventory:sku-1:low",
  to: "ops@example.com",
  subject: "Low stock on sku-1",
  bodyRef: "bodies/sku-1.html",
};

describe("PubSubInstructionPublisher", () => {
  it("publishes the instruction JSON", async () => {
    const published: SendInstruction[] = [];
    const publisher = new PubSubInstructionPublisher({
      publishMessage: async (message) => {
        published.push(message.json);
        return "1";
      },
    });
    await publisher.publish(instruction);
    expect(published).toEqual([instruction]);
  });
});
