import type { HtmlStore } from "../domain/ports/html-store.js";

export class MemoryHtml implements HtmlStore {
  readonly pages = new Map<string, string>();

  async put(key: string, html: string): Promise<void> {
    this.pages.set(key, html);
  }
}
