import { describe, expect, it } from "vitest";
import { cloudRunIdentityToken } from "./http-stock-lookup.js";

describe("cloudRunIdentityToken", () => {
  it("skips the metadata server for local HTTP URLs", async () => {
    await expect(
      cloudRunIdentityToken("http://127.0.0.1:3002"),
    ).resolves.toBeUndefined();
  });
});
