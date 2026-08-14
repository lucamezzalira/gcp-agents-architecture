import { PubSub, type Message } from "@google-cloud/pubsub";
import { BodyNotFoundError } from "../domain/body-not-found.js";
import type { Logger } from "../domain/ports/logger.js";
import { parseSendInstruction } from "../domain/send-instruction.js";
import type { InstructionHandler } from "./instruction-route.js";
import { withPubSubConsumeFromAttributes } from "./trace-context.js";

export async function processInstructionMessage(
  data: Buffer,
  handle: InstructionHandler,
  logger: Logger,
): Promise<"ack" | "nack"> {
  let payload: unknown;
  try {
    payload = JSON.parse(data.toString("utf8")) as unknown;
  } catch {
    logger.withCorrelation("unparsed").warn("instruction.invalid");
    return "ack";
  }
  const instruction = parseSendInstruction(payload);
  if (instruction === undefined) {
    logger.withCorrelation("unparsed").warn("instruction.invalid");
    return "ack";
  }
  const log = logger.withCorrelation(instruction.messageId);
  log.info("instruction.received");
  try {
    await handle(instruction);
    log.info("instruction.acked");
    return "ack";
  } catch (error: unknown) {
    if (error instanceof BodyNotFoundError) {
      log.warn("instruction.body-missing");
      return "ack";
    }
    log.error("instruction.nacked");
    return "nack";
  }
}

export function listenForInstructions(
  subscriptionName: string,
  handle: InstructionHandler,
  logger: Logger,
): { close: () => Promise<void> } {
  const subscription = new PubSub().subscription(subscriptionName);
  const onMessage = (message: Message): void => {
    void withPubSubConsumeFromAttributes(message.attributes, () =>
      processInstructionMessage(message.data, handle, logger),
    ).then((decision) => {
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
