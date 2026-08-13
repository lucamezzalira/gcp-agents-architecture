import type { BodyStore } from "../../../notification/src/domain/body-store.js";

export async function readOtherStore(store: BodyStore): Promise<void> {
  await store.get("x");
}
