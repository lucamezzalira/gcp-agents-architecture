import { z } from "zod";
import type { StockLookup } from "../domain/ports/stock-lookup.js";
import { tracedFetch } from "@observability/runtime";

const levelSchema = z.object({
  sku: z.string().min(1),
  available: z.number().int().nonnegative(),
});

export async function cloudRunIdentityToken(
  audience: string,
): Promise<string | undefined> {
  if (!audience.startsWith("https://")) {
    return undefined;
  }
  try {
    const response = await fetch(
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`,
      { headers: { "Metadata-Flavor": "Google" } },
    );
    if (!response.ok) {
      return undefined;
    }
    const token = (await response.text()).trim();
    return token.length > 0 ? token : undefined;
  } catch {
    return undefined;
  }
}

export class HttpStockLookup implements StockLookup {
  constructor(private readonly inventoryBaseUrl: string) {}

  async available(sku: string): Promise<number> {
    const url = `${this.inventoryBaseUrl.replace(/\/$/, "")}/stock/${encodeURIComponent(sku)}`;
    const headers: Record<string, string> = {};
    const token = await cloudRunIdentityToken(this.inventoryBaseUrl);
    if (token !== undefined) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await tracedFetch(url, { method: "GET", headers }, "inventory");
    if (response.status === 404) {
      return 0;
    }
    if (!response.ok) {
      throw new Error(`inventory stock lookup failed: ${response.status}`);
    }
    const parsed = levelSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error("inventory stock lookup returned an invalid body");
    }
    return parsed.data.available;
  }
}
