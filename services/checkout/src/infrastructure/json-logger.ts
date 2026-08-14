import type {
  CorrelatedLogger,
  LogFields,
  Logger,
} from "../domain/ports/logger.js";

export type LogWriter = (line: string) => void;

export class JsonLogger implements Logger {
  constructor(
    private readonly write: LogWriter = (line) => {
      process.stdout.write(`${line}\n`);
    },
  ) {}

  withCorrelation(correlationId: string): CorrelatedLogger {
    const write = this.write;
    const payload = (
      level: "info" | "warn" | "error",
      event: string,
      fields?: LogFields,
    ): string =>
      JSON.stringify({
        service: "checkout",
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
  }
}
