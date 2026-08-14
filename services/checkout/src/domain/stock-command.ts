export const CHECKOUT_SKU = "standard-item";
export const CHECKOUT_UNITS = 1;

export type StockCommand = {
  action: "reserve" | "release" | "confirm";
  orderId: string;
  sku: string;
  units: number;
};

export function reserveCommand(orderId: string): StockCommand {
  return {
    action: "reserve",
    orderId,
    sku: CHECKOUT_SKU,
    units: CHECKOUT_UNITS,
  };
}

export function releaseCommand(orderId: string): StockCommand {
  return {
    action: "release",
    orderId,
    sku: CHECKOUT_SKU,
    units: CHECKOUT_UNITS,
  };
}

export function confirmCommand(orderId: string): StockCommand {
  return {
    action: "confirm",
    orderId,
    sku: CHECKOUT_SKU,
    units: CHECKOUT_UNITS,
  };
}
