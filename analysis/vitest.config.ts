import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["arch-tests/**/*.test.ts", "runtime-graph.test.ts"],
    testTimeout: 60000,
  },
});
