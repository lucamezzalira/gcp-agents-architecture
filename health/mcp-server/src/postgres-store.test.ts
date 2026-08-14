import { describe, expect, it } from "vitest";
import { postgresTarget } from "./postgres-store.js";

describe("postgresTarget", () => {
  it("keeps a TCP URL as-is", () => {
    const url = "postgresql://health:health@127.0.0.1:5433/health";
    expect(postgresTarget(url)).toEqual({ kind: "url", url });
  });

  it("reads a Cloud SQL unix socket from the host query param", () => {
    const url =
      "postgresql://health:s3cret@/health?host=/cloudsql/ga-health-mezzalab:europe-west1:health";
    expect(postgresTarget(url)).toEqual({
      kind: "socket",
      host: "/cloudsql/ga-health-mezzalab:europe-west1:health",
      database: "health",
      username: "health",
      password: "s3cret",
    });
  });
});
