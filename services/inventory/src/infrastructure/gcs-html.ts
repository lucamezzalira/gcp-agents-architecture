import { Storage } from "@google-cloud/storage";
import type { HtmlStore } from "../domain/ports/html-store.js";

export class GcsHtml implements HtmlStore {
  constructor(private readonly bucketName: string) {}

  async put(key: string, html: string): Promise<void> {
    const file = new Storage().bucket(this.bucketName).file(key);
    await file.save(html, { contentType: "text/html; charset=utf-8" });
  }
}
