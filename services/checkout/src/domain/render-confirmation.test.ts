import { describe, expect, it } from "vitest";
import type { Order } from "./order.js";
import { confirmationBodyRef, renderConfirmation } from "./render-confirmation.js";
import { renderExpeditedConfirmation } from "./render-expedited-confirmation.js";

const order: Order = {
  id: "ord-1",
  email: "buyer@example.com",
  status: "pending",
  shippingTier: "standard",
};

describe("confirmation templates", () => {
  it("states a 48 hour window for standard shipping", () => {
    const html = renderConfirmation(order);
    expect(html).toContain("48 hours");
    expect(html).toContain(order.id);
    expect(html).not.toContain("24 hours");
  });

  it("states a 24 hour dispatch window for expedited shipping", () => {
    const html = renderExpeditedConfirmation({
      ...order,
      shippingTier: "expedited",
    });
    expect(html).toContain("24 hours");
    expect(html).toContain(order.id);
    expect(html).not.toContain("48 hours");
  });

  it("keeps confirmation objects under the same bodyRef", () => {
    expect(confirmationBodyRef(order.id)).toBe("orders/ord-1/confirmation.html");
  });
});
