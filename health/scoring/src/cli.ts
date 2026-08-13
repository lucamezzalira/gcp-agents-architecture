import { readFileSync } from "node:fs";
import { score } from "./score.js";
import {
  acceptedDecisionSchema,
  analysisPayloadSchema,
} from "./schemas.js";
import type { AcceptedDecision } from "./types.js";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function main(): void {
  const args = process.argv.slice(2).filter((item) => item !== "--");
  const payloadPath = args[0];
  const decisionsPath = args[1];
  if (payloadPath === undefined) {
    process.stderr.write("usage: score <payload.json> [decisions.json]\n");
    process.exitCode = 1;
    return;
  }
  const payload = analysisPayloadSchema.parse(readJson(payloadPath));
  let decisions: AcceptedDecision[] = [];
  if (decisionsPath !== undefined) {
    const raw = readJson(decisionsPath);
    decisions = Array.isArray(raw)
      ? raw.map((item) => acceptedDecisionSchema.parse(item))
      : [acceptedDecisionSchema.parse(raw)];
  }
  const result = score(payload, decisions);
  process.stdout.write(JSON.stringify(result) + "\n");
}

main();
