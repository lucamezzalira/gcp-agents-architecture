import { z } from "zod";

export const sendInstructionSchema = z.object({
  messageId: z.string().min(1),
  to: z.string().min(1),
  subject: z.string(),
  bodyRef: z.string().min(1),
});

export type SendInstruction = z.infer<typeof sendInstructionSchema>;
