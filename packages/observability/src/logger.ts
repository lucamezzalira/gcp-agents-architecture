export type LogFields = Record<string, string | number | boolean>;

export type CorrelatedLogger = {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
};

export type Logger = {
  withCorrelation(correlationId: string): CorrelatedLogger;
};

export type LogWriter = (line: string) => void;

export function silentLogger(): Logger {
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

export function createJsonLogger(
  service: string,
  write: LogWriter = (line) => {
    process.stdout.write(`${line}\n`);
  },
): Logger {
  return {
    withCorrelation(correlationId: string): CorrelatedLogger {
      const payload = (
        level: "info" | "warn" | "error",
        event: string,
        fields?: LogFields,
      ): string =>
        JSON.stringify({
          service,
          level,
          event,
          correlationId,
          ...(fields ?? {}),
        });
      return {
        info(event, fields) {
          write(payload("info", event, fields));
        },
        warn(event, fields) {
          write(payload("warn", event, fields));
        },
        error(event, fields) {
          write(payload("error", event, fields));
        },
      };
    },
  };
}
