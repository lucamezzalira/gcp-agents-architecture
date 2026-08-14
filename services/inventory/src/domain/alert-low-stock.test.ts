import { describe, expect, it } from "vitest";
import { alertLowStock } from "./alert-low-stock.js";
import { MemoryHtml } from "../infrastructure/memory-html.js";
import { MemoryMail } from "../infrastructure/memory-mail.js";

describe("alertLowStock", () => {
  it("renders, stores HTML, and publishes a send instruction when stock is low", async () => {
    const html = new MemoryHtml();
    const mailer = new MemoryMail();
    const at = new Date("2026-08-14T12:00:00.000Z");

    const instruction = await alertLowStock(
      "standard-item",
      2,
      { html, mailer },
      at,
    );

    expect(instruction?.to).toBe("ops@example.com");
    expect(instruction?.subject).toContain("Low stock");
    expect(instruction?.bodyRef).toBeDefined();
    expect(mailer.sent).toEqual([instruction]);
    expect(html.pages.get(instruction?.bodyRef ?? "")).toContain("2 units");
  });

  it("does not mail when remaining stock is at the threshold", async () => {
    const html = new MemoryHtml();
    const mailer = new MemoryMail();
    const instruction = await alertLowStock(
      "standard-item",
      5,
      { html, mailer },
      new Date(),
    );
    expect(instruction).toBeUndefined();
    expect(mailer.sent).toHaveLength(0);
  });
});
