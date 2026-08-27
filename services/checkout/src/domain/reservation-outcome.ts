import { z } from "zod";

const outcomeSchema = z.object({
  orderId: z.string().min(1),
  result: z.enum(["reserved", "rejected", "released", "confirmed", "expired"]),
  sku: z.string().min(1),
  units: z.number().int().nonnegative(),
});

/** Wire shape shared with inventory (same JSON on reservation-outcomes). */
export type ReservationOutcome = z.infer<typeof outcomeSchema>;

export function parseReservationOutcome(
  value: unknown,
): ReservationOutcome | undefined {
  const parsed = outcomeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
