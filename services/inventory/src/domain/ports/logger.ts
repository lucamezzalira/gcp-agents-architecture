export type LogFields = Record<string, string | number | boolean>;

export type CorrelatedLogger = {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
};

export type Logger = {
  withCorrelation(correlationId: string): CorrelatedLogger;
};

export function quietLogger(): Logger {
  const noop = {
    info() {},
    warn() {},
    error() {},
  };
  return {
    withCorrelation() {
      return noop;
    },
  };
}
