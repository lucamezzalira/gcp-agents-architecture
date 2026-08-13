import type { InstructionPublisher } from "../domain/instruction-publisher.js";
import type { SendInstruction } from "../domain/send-instruction.js";

export class HttpInstructionPublisher implements InstructionPublisher {
  constructor(private readonly instructionsUrl: string) {}

  async publish(instruction: SendInstruction): Promise<void> {
    const response = await fetch(this.instructionsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(instruction),
    });
    if (!response.ok) {
      throw new Error(
        `notification rejected send instruction: ${response.status}`,
      );
    }
  }
}
