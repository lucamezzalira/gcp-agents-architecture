import { describe, expect, it } from "vitest";
import { BodyNotFoundError } from "../domain/body-not-found.js";
import { silentLogger } from "@observability/runtime";
import type { SendInstruction } from "../domain/send-instruction.js";
import { processInstructionMessage } from "./instruction-subscriber.js";

const instruction: SendInstruction = {
  messageId: "msg-1",
  to: "buyer@example.com",
  subject: "Your order",
  bodyRef: "bodies/order-1.html",
};

describe("processInstructionMessage", () => {
  it("acks a valid instruction after the handler runs", async () => {
    const seen: SendInstruction[] = [];
    const decision = await processInstructionMessage(
      Buffer.from(JSON.stringify(instruction)),
      async (item) => {
        seen.push(item);
        return { status: "sent" };
      },
      silentLogger(),
    );
    expect(decision).toBe("ack");
    expect(seen).toEqual([instruction]);
  });

  it("acks poison JSON so it is not retried forever", async () => {
    const decision = await processInstructionMessage(
      Buffer.from("not-json"),
      async () => ({ status: "sent" }),
      silentLogger(),
    );
    expect(decision).toBe("ack");
  });

  it("acks a missing body", async () => {
    const decision = await processInstructionMessage(
      Buffer.from(JSON.stringify(instruction)),
      async () => {
        throw new BodyNotFoundError(instruction.bodyRef);
      },
      silentLogger(),
    );
    expect(decision).toBe("ack");
  });

  it("nacks unexpected handler failures", async () => {
    const decision = await processInstructionMessage(
      Buffer.from(JSON.stringify(instruction)),
      async () => {
        throw new Error("provider down");
      },
      silentLogger(),
    );
    expect(decision).toBe("nack");
  });
});
