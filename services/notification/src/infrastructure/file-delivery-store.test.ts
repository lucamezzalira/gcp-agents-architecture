import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileDeliveryStore } from "./file-delivery-store.js";

describe("FileDeliveryStore", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  async function store(): Promise<FileDeliveryStore> {
    const root = await mkdtemp(join(tmpdir(), "deliveries-"));
    dirs.push(root);
    return new FileDeliveryStore(root);
  }

  it("claims once, then refuses until released", async () => {
    const deliveries = await store();
    expect(await deliveries.claim("msg-1")).toBe(true);
    expect(await deliveries.claim("msg-1")).toBe(false);
    await deliveries.release("msg-1");
    expect(await deliveries.claim("msg-1")).toBe(true);
  });

  it("markSent blocks further claims", async () => {
    const deliveries = await store();
    expect(await deliveries.claim("msg-2")).toBe(true);
    await deliveries.markSent("msg-2");
    expect(await deliveries.claim("msg-2")).toBe(false);
  });

  it("resolves beside BODY_STORE_DIR", () => {
    const beside = FileDeliveryStore.besideBodyStore("/tmp/bodies");
    expect(beside).toBeInstanceOf(FileDeliveryStore);
  });
});
