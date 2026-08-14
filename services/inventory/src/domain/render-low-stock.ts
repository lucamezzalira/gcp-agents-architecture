export function renderLowStock(sku: string, remaining: number): string {
  return `<p>SKU ${sku} is down to ${remaining} units. Restock before checkout starts rejecting reserves.</p>`;
}

export function lowStockBodyRef(sku: string, at: string): string {
  return `inventory/${sku}/low-stock-${at}.html`;
}
