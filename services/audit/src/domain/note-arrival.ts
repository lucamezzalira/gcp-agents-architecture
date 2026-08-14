import type { Tape } from "./ports/tape.js";

export function idFromUnknown(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const record = payload as { messageId?: unknown; id?: unknown };
  if (typeof record.messageId === "string" && record.messageId.length > 0) {
    return record.messageId;
  }
  if (typeof record.id === "string" && record.id.length > 0) {
    return record.id;
  }
  return undefined;
}

export async function noteArrival(
  payload: unknown,
  tape: Tape,
  clock: () => Date = () => new Date(),
): Promise<boolean> {
  const entryId = idFromUnknown(payload);
  if (entryId === undefined) {
    return false;
  }
  await tape.record({
    entryId,
    topicHint: "send-instructions",
    recordedAt: clock().toISOString(),
  });
  return true;
}
