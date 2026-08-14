import { z } from "zod";
import { orderSchema } from "./order.js";

export const reservationCommandSchema = z.object({
  action: z.enum(["reserve", "release", "confirm"]),
  orderId: z.string().min(1),
  sku: z.string().min(1),
  units: z.number().int().positive(),
  order: orderSchema.optional(),
});

export type ReservationCommand = z.infer<typeof reservationCommandSchema>;

export function parseReservationCommand(
  value: unknown,
): ReservationCommand | undefined {
  const parsed = reservationCommandSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
