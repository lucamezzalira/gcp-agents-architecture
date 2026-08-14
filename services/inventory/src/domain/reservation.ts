import { z } from "zod";

export const reservationStatusSchema = z.enum([
  "held",
  "confirmed",
  "released",
  "expired",
]);

export const reservationSchema = z.object({
  orderId: z.string().min(1),
  sku: z.string().min(1),
  units: z.number().int().positive(),
  status: reservationStatusSchema,
  reservedAt: z.string().min(1),
});

export type ReservationStatus = z.infer<typeof reservationStatusSchema>;
export type Reservation = z.infer<typeof reservationSchema>;
