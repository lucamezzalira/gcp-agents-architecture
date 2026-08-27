import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analysisPayloadSchema } from "../src/schemas.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const keysPath = join(repoRoot, "analysis/payload-top-level-keys.json");

describe("AnalysisPayload top-level keys", () => {
  it("matches the checked-in key list used by the Python agent", () => {
    const expected = JSON.parse(readFileSync(keysPath, "utf8")) as string[];
    expect(Object.keys(analysisPayloadSchema.shape).sort()).toEqual(
      [...expected].sort(),
    );
  });
});
