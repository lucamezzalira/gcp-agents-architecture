import postgres from "postgres";

export function databaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    "postgresql://health:health@127.0.0.1:5433/health"
  );
}

export type PostgresTarget =
  | { kind: "url"; url: string }
  | {
      kind: "socket";
      host: string;
      database: string;
      username: string;
      password: string;
    };

export function postgresTarget(url: string): PostgresTarget {
  const socketMatch = url.match(/[?&]host=(\/[^&]*)/);
  if (socketMatch === null || socketMatch[1] === undefined) {
    return { kind: "url", url };
  }
  const parsed = new URL(url.replace("@/", "@unused/"));
  return {
    kind: "socket",
    host: decodeURIComponent(socketMatch[1]),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  };
}

export type Sql = ReturnType<typeof postgres>;

const clients = new Map<string, Sql>();

export function dropSqlClient(url: string): void {
  const existing = clients.get(url);
  if (existing === undefined) {
    return;
  }
  clients.delete(url);
  void existing.end({ timeout: 1 }).catch(() => undefined);
}

export function shouldRetryConnection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("EPIPE") ||
    message.includes("ECONNRESET") ||
    message.includes("CONNECTION_CLOSED") ||
    message.includes("connect")
  );
}

export function sqlClient(url: string): Sql {
  const existing = clients.get(url);
  if (existing !== undefined) {
    return existing;
  }
  const options = {
    max: 2,
    idle_timeout: 10,
    max_lifetime: 60,
    connect_timeout: 5,
    prepare: false,
    connection: {
      statement_timeout: 8000,
      lock_timeout: 3000,
    },
  } as const;
  const target = postgresTarget(url);
  const sql =
    target.kind === "url"
      ? postgres(target.url, options)
      : postgres({
          host: target.host,
          database: target.database,
          username: target.username,
          password: target.password,
          ...options,
        });
  clients.set(url, sql);
  return sql;
}

/** Run a query function once, retrying once after CONNECTION_CLOSED-class errors. */
export async function withSqlRetry<T>(
  url: string,
  run: (sql: Sql) => Promise<T>,
): Promise<T> {
  try {
    return await run(sqlClient(url));
  } catch (error) {
    dropSqlClient(url);
    if (!shouldRetryConnection(error)) {
      throw error;
    }
    return await run(sqlClient(url));
  }
}
