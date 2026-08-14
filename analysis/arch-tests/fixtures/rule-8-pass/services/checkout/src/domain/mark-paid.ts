export type OrderStore = { save(): void };
export function decide(store: OrderStore): void {
  store.save();
}
