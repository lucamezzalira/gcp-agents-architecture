import { matchingDecision } from "./suppress.js";
import type {
  AcceptedDecision,
  AnalysisPayload,
  CharacteristicId,
  CharacteristicScore,
  ScoreResult,
} from "./types.js";
import {
  ARCH_PENALTIES,
  CHARACTERISTIC_ORDER,
  CHARACTERISTIC_WEIGHTS,
  CYCLE_PENALTY,
  DUPLICATION_PENALTY_PER_PERCENT,
  DUPLICATION_THRESHOLD_PERCENT,
  ORPHAN_PENALTY,
} from "./weights.js";

type Finding = {
  ruleId: string;
  paths: string[];
  characteristic: CharacteristicId;
  penalty: number;
  signal: string;
};

function collectFindings(payload: AnalysisPayload): Finding[] {
  const findings: Finding[] = [];

  for (const result of payload.archTests) {
    if (result.passed) {
      continue;
    }
    const mapping = ARCH_PENALTIES[result.ruleId];
    if (mapping === undefined) {
      continue;
    }
    for (const violation of result.violations) {
      findings.push({
        ruleId: result.ruleId,
        paths: [violation.file],
        characteristic: mapping.characteristic,
        penalty: mapping.penalty,
        signal: `ts-arch:${result.ruleId}:${violation.file}`,
      });
    }
  }

  for (const cycle of payload.dependencyCruiser.cycles) {
    findings.push({
      ruleId: "cycle",
      paths: cycle.path,
      characteristic: "coupling",
      penalty: CYCLE_PENALTY,
      signal: `dependency-cruiser:cycle:${cycle.path.join(">")}`,
    });
  }

  for (const orphan of payload.dependencyCruiser.orphans) {
    findings.push({
      ruleId: "orphan",
      paths: [orphan],
      characteristic: "coupling",
      penalty: ORPHAN_PENALTY,
      signal: `dependency-cruiser:orphan:${orphan}`,
    });
  }

  const excessPercent = Math.floor(
    payload.duplication.percentage - DUPLICATION_THRESHOLD_PERCENT,
  );
  if (excessPercent > 0) {
    const files = [
      ...new Set(payload.duplication.clones.flatMap((clone) => clone.files)),
    ].sort();
    findings.push({
      ruleId: "duplication",
      paths: files,
      characteristic: "duplication",
      penalty: excessPercent * DUPLICATION_PENALTY_PER_PERCENT,
      signal: `jscpd:percentage:${payload.duplication.percentage}`,
    });
  }

  return findings;
}

export function score(
  payload: AnalysisPayload,
  decisions: AcceptedDecision[],
): ScoreResult {
  const buckets: Record<
    CharacteristicId,
    { penalty: number; signalsUsed: string[]; suppressedBy: string[] }
  > = {
    "boundary-integrity": { penalty: 0, signalsUsed: [], suppressedBy: [] },
    layering: { penalty: 0, signalsUsed: [], suppressedBy: [] },
    coupling: { penalty: 0, signalsUsed: [], suppressedBy: [] },
    duplication: { penalty: 0, signalsUsed: [], suppressedBy: [] },
  };

  for (const finding of collectFindings(payload)) {
    const bucket = buckets[finding.characteristic];
    const decision = matchingDecision(finding, decisions);
    if (decision !== undefined) {
      bucket.suppressedBy.push(decision.id);
      continue;
    }
    bucket.penalty += finding.penalty;
    bucket.signalsUsed.push(finding.signal);
  }

  const characteristics: CharacteristicScore[] = CHARACTERISTIC_ORDER.map(
    (id) => {
      const bucket = buckets[id];
      const characteristic: CharacteristicScore = {
        id,
        score: Math.max(0, 100 - bucket.penalty),
        signalsUsed: [...bucket.signalsUsed].sort(),
      };
      const suppressedBy = [...new Set(bucket.suppressedBy)].sort();
      if (suppressedBy.length > 0) {
        characteristic.suppressedBy = suppressedBy;
      }
      return characteristic;
    },
  );

  const overall = Math.round(
    characteristics.reduce(
      (sum, characteristic) =>
        sum + characteristic.score * CHARACTERISTIC_WEIGHTS[characteristic.id],
      0,
    ),
  );

  return { overall, characteristics };
}
