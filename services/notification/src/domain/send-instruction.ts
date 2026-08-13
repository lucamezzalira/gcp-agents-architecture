import { z } from "zod";

export const sendInstructionSchema = z.object({
  messageId: z.string().min(1),
  to: z.string().min(1),
  subject: z.string(),
  bodyRef: z.string().min(1).describe("Object id in storage. Not the HTML document."),
});

export type SendInstruction = z.infer<typeof sendInstructionSchema>;

export function parseSendInstruction(
  value: unknown,
): SendInstruction | undefined {
  const parsed = sendInstructionSchema.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }
  return parsed.data;
}
