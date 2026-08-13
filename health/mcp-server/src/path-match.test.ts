import { describe, expect, it } from "vitest";
import { pathMatchesGlob, signalTouchesPath } from "./path-match.js";

describe("pathMatchesGlob", () => {
  it("matches a prefix glob", () => {
    expect(
      pathMatchesGlob(
        "services/checkout/src/domain/mark-paid.ts",
        "services/checkout/**",
      ),
    ).toBe(true);
    expect(
      pathMatchesGlob(
        "services/notification/src/domain/deliver.ts",
        "services/checkout/**",
      ),
    ).toBe(false);
  });

  it("matches an exact path", () => {
    expect(
      pathMatchesGlob("services/checkout", "services/checkout"),
    ).toBe(true);
  });
});

describe("signalTouchesPath", () => {
  it("treats a file path as a substring of a ts-arch signal", () => {
    expect(
      signalTouchesPath(
        "ts-arch:rule-3:services/checkout/src/domain/mark-paid.ts",
        "services/checkout",
      ),
    ).toBe(true);
  });
});
