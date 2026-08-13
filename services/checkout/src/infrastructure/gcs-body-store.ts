import { Storage } from "@google-cloud/storage";
import type { BodyStore } from "../domain/body-store.js";

export type WritableBucket = {
  file(name: string): {
    save(html: string, options: { contentType: string }): Promise<void>;
  };
};

export class GcsBodyStore implements BodyStore {
  constructor(private readonly bucket: WritableBucket) {}

  static fromBucketName(name: string): GcsBodyStore {
    return new GcsBodyStore(new Storage().bucket(name));
  }

  async put(bodyRef: string, html: string): Promise<void> {
    await this.bucket.file(bodyRef).save(html, { contentType: "text/html" });
  }
}
