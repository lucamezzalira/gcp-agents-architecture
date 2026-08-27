import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PENDING_RECLAIM_AFTER_MS } from "./delivery-timing.js";
import type { DeliveryStore } from "../domain/ports/delivery-store.js";

type DeliveryStatus = "pending" | "sent";

type Entry = {
  status: DeliveryStatus;
  claimedAtMs: number;
};

function safeId(messageId: string): string {
  return messageId.replace(/[^A-Za-z0-9._-]/g, "_");
}

/**
 * Durable local idempotency store. Lives beside BODY_STORE_DIR
 * (e.g. `.local/bodies` → `.local/deliveries`).
 */
export class FileDeliveryStore implements DeliveryStore {
  constructor(private readonly root: string) {}

  static besideBodyStore(bodyStoreDir: string): FileDeliveryStore {
    return new FileDeliveryStore(join(bodyStoreDir, "..", "deliveries"));
  }

  private pathFor(messageId: string): string {
    return join(this.root, `${safeId(messageId)}.json`);
  }

  private async read(messageId: string): Promise<Entry | undefined> {
    try {
      const raw = await readFile(this.pathFor(messageId), "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("status" in parsed) ||
        !("claimedAtMs" in parsed)
      ) {
        return undefined;
      }
      const status = (parsed as { status: unknown }).status;
      const claimedAtMs = (parsed as { claimedAtMs: unknown }).claimedAtMs;
      if (
        (status !== "pending" && status !== "sent") ||
        typeof claimedAtMs !== "number"
      ) {
        return undefined;
      }
      return { status, claimedAtMs };
    } catch {
      return undefined;
    }
  }

  private async write(messageId: string, entry: Entry): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const target = this.pathFor(messageId);
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(entry), "utf8");
    await rename(temp, target);
  }

  async claim(messageId: string): Promise<boolean> {
    const current = await this.read(messageId);
    const now = Date.now();
    if (current?.status === "sent") {
      return false;
    }
    if (current?.status === "pending") {
      if (now - current.claimedAtMs < PENDING_RECLAIM_AFTER_MS) {
        return false;
      }
      await this.write(messageId, { status: "pending", claimedAtMs: now });
      return true;
    }
    await this.write(messageId, { status: "pending", claimedAtMs: now });
    return true;
  }

  async markSent(messageId: string): Promise<void> {
    const current = await this.read(messageId);
    await this.write(messageId, {
      status: "sent",
      claimedAtMs: current?.claimedAtMs ?? Date.now(),
    });
  }

  async release(messageId: string): Promise<void> {
    const current = await this.read(messageId);
    if (current?.status !== "pending") {
      return;
    }
    try {
      await unlink(this.pathFor(messageId));
    } catch {
      // already gone
    }
  }
}
