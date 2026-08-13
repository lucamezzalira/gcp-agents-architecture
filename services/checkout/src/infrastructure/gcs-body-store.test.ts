import { describe, expect, it } from "vitest";
import { GcsBodyStore } from "./gcs-body-store.js";

class FakeBucket {
  readonly files = new Map<string, string>();

  file(name: string) {
    return {
      save: async (html: string, _options: { contentType: string }): Promise<void> => {
        this.files.set(name, html);
      },
    };
  }
}

describe("GcsBodyStore", () => {
  it("writes html at the bodyRef key", async () => {
    const bucket = new FakeBucket();
    const store = new GcsBodyStore(bucket);
    await store.put("bodies/ord-1.html", "<p>ships within 48 hours</p>");
    expect(bucket.files.get("bodies/ord-1.html")).toBe(
      "<p>ships within 48 hours</p>",
    );
  });
});
