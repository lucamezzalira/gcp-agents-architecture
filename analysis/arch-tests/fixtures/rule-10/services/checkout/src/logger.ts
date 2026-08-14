import type { Logger } from "@observability/runtime";

export function createJsonLogger(): Logger {
  return {
    withCorrelation() {
      return {
        info() {},
        warn() {},
        error() {},
      };
    },
  };
}
