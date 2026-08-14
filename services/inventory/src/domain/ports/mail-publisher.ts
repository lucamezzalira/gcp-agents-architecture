import type { SendInstruction } from "../send-instruction.js";

export type { SendInstruction };

export type MailPublisher = {
  publish(instruction: SendInstruction): Promise<void>;
};
