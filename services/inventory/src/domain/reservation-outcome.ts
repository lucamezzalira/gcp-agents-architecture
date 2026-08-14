import { z } from "zod";

export const reservationOutcomeSchema = z.object({
  orderId: z.string().min(1),
  result: z.enum(["reserved", "rejected", "released", "confirmed", "expired"]),
  sku: z.string().min(1),
  units: z.number().int().nonnegative(),
});

export type ReservationOutcome = z.infer<typeof reservationOutcomeSchema>;
