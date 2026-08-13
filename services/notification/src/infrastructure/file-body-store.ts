import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import type { BodyStore } from "../domain/body-store.js";

function resolveRef(root: string, bodyRef: string): string {
  const relative = bodyRef.split("/").filter((part) => part.length > 0 && part !== "..");
  const resolved = normalize(join(root, ...relative));
  const base = normalize(root) + sep;
  if (!resolved.startsWith(base) && resolved !== normalize(root)) {
    throw new Error("bodyRef escapes the body store");
  }
  return resolved;
}

export class FileBodyStore implements BodyStore {
  constructor(private readonly root: string) {}

  async get(bodyRef: string): Promise<string | undefined> {
    try {
      return await readFile(resolveRef(this.root, bodyRef), "utf8");
    } catch {
      return undefined;
    }
  }
}
