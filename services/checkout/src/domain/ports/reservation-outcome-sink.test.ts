import { describe, expect, it } from "vitest";
import { canAdvanceOutcome, isPayReady } from "./reservation-outcome-sink.js";

describe("outcome status FSM", () => {
  it("allows reserved to advance to terminal results", () => {
    expect(canAdvanceOutcome("reserved", "confirmed")).toBe(true);
    expect(canAdvanceOutcome("reserved", "expired")).toBe(true);
    expect(canAdvanceOutcome("reserved", "released")).toBe(true);
    expect(canAdvanceOutcome("reserved", "rejected")).toBe(true);
  });

  it("blocks reserved after expire or reject", () => {
    expect(canAdvanceOutcome("expired", "reserved")).toBe(false);
    expect(canAdvanceOutcome("rejected", "reserved")).toBe(false);
    expect(canAdvanceOutcome("released", "confirmed")).toBe(false);
    expect(canAdvanceOutcome("confirmed", "reserved")).toBe(false);
  });

  it("treats reserved and confirmed as pay-ready", () => {
    expect(isPayReady("reserved")).toBe(true);
    expect(isPayReady("confirmed")).toBe(true);
    expect(isPayReady("expired")).toBe(false);
  });
});
