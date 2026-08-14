import type { AttrMap, Log } from "../domain/ports/logger.js";

export class LineLogger implements Log {
  constructor(private readonly serviceName: string) {}

  bind(cid: string): {
    info(name: string, attrs?: AttrMap): void;
    warn(name: string, attrs?: AttrMap): void;
    error(name: string, attrs?: AttrMap): void;
  } {
    const serviceName = this.serviceName;
    const emit = (level: string, name: string, attrs?: AttrMap): void => {
      const parts = [`svc=${serviceName}`, `lvl=${level}`, `evt=${name}`, `cid=${cid}`];
      if (attrs !== undefined) {
        for (const key of Object.keys(attrs)) {
          parts.push(`${key}=${String(attrs[key])}`);
        }
      }
      process.stdout.write(`${parts.join(" ")}\n`);
    };
    return {
      info(name, attrs) {
        emit("info", name, attrs);
      },
      warn(name, attrs) {
        emit("warn", name, attrs);
      },
      error(name, attrs) {
        emit("error", name, attrs);
      },
    };
  }
}
