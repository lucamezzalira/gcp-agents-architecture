import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import type { BodyStore } from "../domain/ports/body-store.js";

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

  async put(bodyRef: string, html: string): Promise<void> {
    const path = resolveRef(this.root, bodyRef);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, html, "utf8");
  }
}
