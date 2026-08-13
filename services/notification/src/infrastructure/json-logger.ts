import type {
  CorrelatedLogger,
  LogFields,
  Logger,
} from "../domain/logger.js";

export type LogWriter = (line: string) => void;

function writeToConsole(line: string): void {
  console.log(line);
}

export class JsonLogger implements Logger {
  private readonly service = "notification";
  private readonly write: LogWriter;

  constructor(write: LogWriter = writeToConsole) {
    this.write = write;
  }

  withCorrelation(correlationId: string): CorrelatedLogger {
    return {
      info: (event, fields) => this.emit("info", correlationId, event, fields),
      warn: (event, fields) => this.emit("warn", correlationId, event, fields),
      error: (event, fields) => this.emit("error", correlationId, event, fields),
    };
  }

  private emit(
    level: "info" | "warn" | "error",
    correlationId: string,
    event: string,
    fields?: LogFields,
  ): void {
    const line: Record<string, string | number | boolean> = {
      service: this.service,
      level,
      event,
      correlationId,
    };
    if (fields !== undefined) {
      for (const [key, value] of Object.entries(fields)) {
        line[key] = value;
      }
    }
    this.write(JSON.stringify(line));
  }
}
