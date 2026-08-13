import { z } from "zod";

export const sendInstructionSchema = z.object({
  messageId: z.string().min(1),
  to: z.string().min(1),
  subject: z.string(),
  bodyRef: z.string().min(1).describe("Object id in storage. The event does not carry the HTML."),
});

export type SendInstruction = z.infer<typeof sendInstructionSchema>;
