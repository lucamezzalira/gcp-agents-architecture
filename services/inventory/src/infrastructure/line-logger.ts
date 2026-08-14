import type { Logger, LogFields } from "../domain/ports/logger.js";

export class LineLogger implements Logger {
  constructor(private readonly serviceName: string) {}

  withCorrelation(correlationId: string) {
    const serviceName = this.serviceName;
    const emit = (level: string, event: string, fields?: LogFields): void => {
      const line = [
        `svc=${serviceName}`,
        `lvl=${level}`,
        `evt=${event}`,
        `cid=${correlationId}`,
      ];
      if (fields !== undefined) {
        for (const [key, value] of Object.entries(fields)) {
          line.push(`${key}=${String(value)}`);
        }
      }
      process.stdout.write(`${line.join(" ")}\n`);
    };
    return {
      info(event: string, fields?: LogFields) {
        emit("info", event, fields);
      },
      warn(event: string, fields?: LogFields) {
        emit("warn", event, fields);
      },
      error(event: string, fields?: LogFields) {
        emit("error", event, fields);
      },
    };
  }
}
