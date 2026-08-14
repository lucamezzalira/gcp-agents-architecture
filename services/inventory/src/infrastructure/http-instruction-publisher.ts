import type { InstructionPublisher } from "../domain/ports/instruction-publisher.js";
import type { SendInstruction } from "../domain/ports/instruction-publisher.js";
import { tracedFetch } from "@observability/runtime";

export class HttpInstructionPublisher implements InstructionPublisher {
  constructor(private readonly instructionsUrl: string) {}

  async publish(instruction: SendInstruction): Promise<void> {
    const response = await tracedFetch(
      this.instructionsUrl,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(instruction),
      },
      "notification",
    );
    if (!response.ok) {
      throw new Error(
        `notification rejected send instruction: ${response.status}`,
      );
    }
  }
}
