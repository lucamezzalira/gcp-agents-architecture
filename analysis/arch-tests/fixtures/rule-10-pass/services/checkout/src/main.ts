import { startTracing } from "@observability/runtime";

export async function boot(): Promise<void> {
  await startTracing("checkout");
}
