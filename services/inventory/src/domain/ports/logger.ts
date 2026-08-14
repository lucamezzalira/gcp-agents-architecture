export type AttrMap = { [name: string]: string | number | boolean };

export type BoundLog = {
  info(name: string, attrs?: AttrMap): void;
  warn(name: string, attrs?: AttrMap): void;
  error(name: string, attrs?: AttrMap): void;
};

export type Log = {
  bind(cid: string): BoundLog;
};

export function quietLog(): Log {
  const sink: BoundLog = {
    info() {},
    warn() {},
    error() {},
  };
  return {
    bind() {
      return sink;
    },
  };
}
