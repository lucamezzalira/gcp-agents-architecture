import type { BodyStore } from "../domain/ports/body-store.js";

export class InMemoryBodyStore implements BodyStore {
  private readonly objects = new Map<string, string>();

  put(bodyRef: string, body: string): void {
    this.objects.set(bodyRef, body);
  }

  async get(bodyRef: string): Promise<string | undefined> {
    return this.objects.get(bodyRef);
  }
}
