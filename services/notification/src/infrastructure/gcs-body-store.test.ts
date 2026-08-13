import { describe, expect, it } from "vitest";
import { GcsBodyStore } from "./gcs-body-store.js";

class FakeBucket {
  constructor(private readonly files: Map<string, string>) {}

  file(name: string) {
    return {
      exists: async (): Promise<[boolean]> => [this.files.has(name)],
      download: async (): Promise<[Buffer]> => [
        Buffer.from(this.files.get(name) ?? "", "utf8"),
      ],
    };
  }
}

describe("GcsBodyStore", () => {
  it("returns html for an existing object", async () => {
    const store = new GcsBodyStore(
      new FakeBucket(new Map([["bodies/ord-1.html", "<p>ok</p>"]])),
    );
    await expect(store.get("bodies/ord-1.html")).resolves.toBe("<p>ok</p>");
  });

  it("returns undefined when the object is missing", async () => {
    const store = new GcsBodyStore(new FakeBucket(new Map()));
    await expect(store.get("missing.html")).resolves.toBeUndefined();
  });
});
