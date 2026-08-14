import { describe, expect, it } from "vitest";
import type { SendInstruction } from "../domain/ports/instruction-publisher.js";
import { PubSubInstructionPublisher } from "./pubsub-instruction-publisher.js";

const instruction: SendInstruction = {
  messageId: "checkout:ord-1:paid",
  to: "buyer@example.com",
  subject: "Order ord-1 confirmed",
  bodyRef: "bodies/ord-1.html",
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
