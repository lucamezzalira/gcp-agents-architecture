import type { BodyStore } from "../domain/ports/body-store.js";

export class InMemoryBodyStore implements BodyStore {
  private readonly objects = new Map<string, string>();

  async put(bodyRef: string, html: string): Promise<void> {
    this.objects.set(bodyRef, html);
  }

  async get(bodyRef: string): Promise<string | undefined> {
    return this.objects.get(bodyRef);
  }
}
