import type { Order } from "./order.js";

export const CHECKOUT_SKU = "standard-item";
export const CHECKOUT_UNITS = 1;

export type OrderSnapshot = {
  id: string;
  email: string;
  status: Order["status"];
  shippingTier: Order["shippingTier"];
  lineItems: Array<{ sku: string; units: number; name: string }>;
};

/** Wire shape shared with inventory (same JSON on stock-reservations). */
export type ReservationCommand = {
  action: "reserve" | "release" | "confirm";
  orderId: string;
  sku: string;
  units: number;
  order: OrderSnapshot;
};

function snapshotOf(order: Order): OrderSnapshot {
  return {
    id: order.id,
    email: order.email,
    status: order.status,
    shippingTier: order.shippingTier,
    lineItems: [
      { sku: CHECKOUT_SKU, units: CHECKOUT_UNITS, name: "Standard item" },
    ],
  };
}

export function reserveCommand(order: Order): ReservationCommand {
  return {
    action: "reserve",
    orderId: order.id,
    sku: CHECKOUT_SKU,
    units: CHECKOUT_UNITS,
    order: snapshotOf(order),
  };
}

export function releaseCommand(order: Order): ReservationCommand {
  return {
    action: "release",
    orderId: order.id,
    sku: CHECKOUT_SKU,
    units: CHECKOUT_UNITS,
    order: snapshotOf(order),
  };
}

export function confirmCommand(order: Order): ReservationCommand {
  return {
    action: "confirm",
    orderId: order.id,
    sku: CHECKOUT_SKU,
    units: CHECKOUT_UNITS,
    order: snapshotOf(order),
  };
}
