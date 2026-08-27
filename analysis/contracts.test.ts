import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractContracts } from "./contracts.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("message contracts", () => {
  it("names SendInstruction publishers, consumer, and fields", () => {
    const send = extractContracts(repoRoot).find(
      (item) => item.name === "SendInstruction",
    );
    expect(send).toBeDefined();
    if (send === undefined) {
      return;
    }
    expect(send.publishers).toEqual(["checkout", "inventory"]);
    expect(send.consumers).toEqual(["notification"]);
    expect(send.fields).toEqual(
      expect.arrayContaining(["messageId", "to", "subject", "bodyRef"]),
    );
    expect(send.fields).not.toEqual(
      expect.arrayContaining(["priority", "kind"]),
    );
  });

  it("names ReservationCommand publisher and consumer on both sides", () => {
    const command = extractContracts(repoRoot).find(
      (item) => item.name === "ReservationCommand",
    );
    expect(command).toBeDefined();
    if (command === undefined) {
      return;
    }
    expect(command.publishers).toEqual(["checkout"]);
    expect(command.consumers).toEqual(["inventory"]);
    expect(command.fields).toEqual(
      expect.arrayContaining(["action", "orderId", "sku", "units", "order"]),
    );
    expect(command.fields).not.toEqual(
      expect.arrayContaining(["email", "shippingTier"]),
    );
  });
});
