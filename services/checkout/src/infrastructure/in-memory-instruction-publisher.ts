import type { InstructionPublisher } from "../domain/ports/instruction-publisher.js";
import type { SendInstruction } from "../domain/ports/instruction-publisher.js";

export class InMemoryInstructionPublisher implements InstructionPublisher {
  readonly published: SendInstruction[] = [];

  async publish(instruction: SendInstruction): Promise<void> {
    this.published.push(instruction);
  }
}
