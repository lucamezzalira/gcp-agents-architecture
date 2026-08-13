import type { InstructionPublisher } from "../domain/instruction-publisher.js";
import type { SendInstruction } from "../domain/send-instruction.js";

export class InMemoryInstructionPublisher implements InstructionPublisher {
  readonly published: SendInstruction[] = [];

  async publish(instruction: SendInstruction): Promise<void> {
    this.published.push(instruction);
  }
}
