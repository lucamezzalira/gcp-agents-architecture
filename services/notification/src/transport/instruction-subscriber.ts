import { PubSub, type Message } from "@google-cloud/pubsub";
import { BodyNotFoundError } from "../domain/body-not-found.js";
import { parseSendInstruction } from "../domain/send-instruction.js";
import type { InstructionHandler } from "./instruction-route.js";

export async function processInstructionMessage(
  data: Buffer,
  handle: InstructionHandler,
): Promise<"ack" | "nack"> {
  let payload: unknown;
  try {
    payload = JSON.parse(data.toString("utf8")) as unknown;
  } catch {
    return "ack";
  }
  const instruction = parseSendInstruction(payload);
  if (instruction === undefined) {
    return "ack";
  }
  try {
    await handle(instruction);
    return "ack";
  } catch (error: unknown) {
    if (error instanceof BodyNotFoundError) {
      return "ack";
    }
    return "nack";
  }
}

export function listenForInstructions(
  subscriptionName: string,
  handle: InstructionHandler,
): { close: () => Promise<void> } {
  const subscription = new PubSub().subscription(subscriptionName);
  const onMessage = (message: Message): void => {
    void processInstructionMessage(message.data, handle).then((decision) => {
      if (decision === "ack") {
        message.ack();
        return;
      }
      message.nack();
    });
  };
  subscription.on("message", onMessage);
  return {
    close: async () => {
      subscription.removeListener("message", onMessage);
      await subscription.close();
    },
  };
}
