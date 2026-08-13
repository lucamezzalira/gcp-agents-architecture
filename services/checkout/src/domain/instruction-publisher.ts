import type { SendInstruction } from "./send-instruction.js";

export type InstructionPublisher = {
  publish(instruction: SendInstruction): Promise<void>;
};
