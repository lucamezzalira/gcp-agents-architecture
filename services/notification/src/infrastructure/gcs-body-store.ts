import { Storage } from "@google-cloud/storage";
import type { BodyStore } from "../domain/ports/body-store.js";

export type ReadableBucket = {
  file(name: string): {
    exists(): Promise<[boolean]>;
    download(): Promise<[Buffer]>;
  };
};

export class GcsBodyStore implements BodyStore {
  constructor(private readonly bucket: ReadableBucket) {}

  static fromBucketName(name: string): GcsBodyStore {
    return new GcsBodyStore(new Storage().bucket(name));
  }

  async get(bodyRef: string): Promise<string | undefined> {
    const file = this.bucket.file(bodyRef);
    const [exists] = await file.exists();
    if (!exists) {
      return undefined;
    }
    const [bytes] = await file.download();
    return bytes.toString("utf8");
  }
}
