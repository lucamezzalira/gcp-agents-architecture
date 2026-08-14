import { classifyClone } from "./classify.js";
import { matchingDecision } from "./suppress.js";
import { discoverServices, serviceFromPath } from "./paths.js";
import type {
  AcceptedDecision,
  AnalysisPayload,
  CharacteristicId,
  CharacteristicScore,
  FolderMetric,
  PlatformCharacteristicId,
  ScoreResult,
  ServiceScore,
} from "./types.js";
import {
  ARCH_PENALTIES,
  CROSS_SERVICE_CLONE_PENALTY,
  CROSS_SERVICE_RULES,
  CYCLE_PENALTY,
  DEP_ON_TEST_PENALTY,
  INSTABILITY_SCALE,
  INTERNAL_CLONE_PENALTY,
  ORPHAN_PENALTY,
  PLATFORM_WEIGHTS,
  SERVICE_CHARACTERISTIC_ORDER,
  SERVICE_WEIGHTS,
  SHARED_CLONE_PENALTY,
  UNRESOLVABLE_PENALTY,
} from "./weights.js";

type Finding = {
  ruleId: string;
  paths: string[];
  characteristic: PlatformCharacteristicId;
  penalty: number;
  signal: string;
  service?: string;
};

type Bucket = {
  penalty: number;
  signalsUsed: string[];
  suppressedBy: string[];
};

function emptyBucket(): Bucket {
  return { penalty: 0, signalsUsed: [], suppressedBy: [] };
}

function emptyFour(): Record<CharacteristicId, Bucket> {
  return {
    "boundary-integrity": emptyBucket(),
    layering: emptyBucket(),
    coupling: emptyBucket(),
    duplication: emptyBucket(),
  };
}

function payloadFiles(payload: AnalysisPayload): string[] {
  const files: string[] = [];
  for (const test of payload.archTests) {
    for (const violation of test.violations) {
      files.push(violation.file);
    }
  }
  for (const cycle of payload.dependencyCruiser.cycles) {
    files.push(...cycle.path);
  }
  files.push(...payload.dependencyCruiser.orphans);
  for (const violation of payload.dependencyCruiser.violations) {
    files.push(violation.from, violation.to);
  }
  for (const metric of payload.dependencyCruiser.folderMetrics) {
    files.push(metric.folder.endsWith("/") ? metric.folder : `${metric.folder}/`);
  }
  for (const clone of payload.duplication.clones) {
    files.push(...clone.files);
  }
  return files;
}

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
      const service = violation.service ?? serviceFromPath(violation.file);
      const signal = `ts-arch:${result.ruleId}:${violation.file}`;
      findings.push({
        ruleId: result.ruleId,
        paths: [violation.file],
        characteristic: mapping.characteristic,
        penalty: mapping.penalty,
        signal,
        service,
      });
      if (CROSS_SERVICE_RULES.has(result.ruleId)) {
        findings.push({
          ruleId: result.ruleId,
          paths: [violation.file],
          characteristic: "cross-service-integrity",
          penalty: mapping.penalty,
          signal,
          service,
        });
      }
    }
  }

  for (const cycle of payload.dependencyCruiser.cycles) {
    findings.push({
      ruleId: "cycle",
      paths: cycle.path,
      characteristic: "coupling",
      penalty: CYCLE_PENALTY,
      signal: `dependency-cruiser:cycle:${cycle.path.join(">")}`,
      service: serviceFromPath(cycle.path[0] ?? ""),
    });
  }

  for (const orphan of payload.dependencyCruiser.orphans) {
    findings.push({
      ruleId: "orphan",
      paths: [orphan],
      characteristic: "coupling",
      penalty: ORPHAN_PENALTY,
      signal: `dependency-cruiser:orphan:${orphan}`,
      service: serviceFromPath(orphan),
    });
  }

  for (const violation of payload.dependencyCruiser.violations) {
    if (violation.rule === "no-circular" || violation.rule === "no-orphans") {
      continue;
    }
    const penalty =
      violation.rule === "not-to-unresolvable"
        ? UNRESOLVABLE_PENALTY
        : violation.rule === "no-dep-on-test"
          ? DEP_ON_TEST_PENALTY
          : undefined;
    if (penalty === undefined) {
      continue;
    }
    findings.push({
      ruleId: violation.rule,
      paths: [violation.from, violation.to],
      characteristic: "coupling",
      penalty,
      signal: `dependency-cruiser:${violation.rule}:${violation.from}`,
      service: serviceFromPath(violation.from),
    });
  }

  for (const clone of payload.duplication.clones) {
    const uniqueFiles = [...new Set(clone.files)];
    if (uniqueFiles.length < 2) {
      continue;
    }
    const classified = classifyClone(clone.files);
    const classification = clone.classification ?? classified.classification;
    const services = clone.services ?? classified.services;
    const key = clone.files.slice().sort().join("|");
    if (classification === "internal" && services[0] !== undefined) {
      findings.push({
        ruleId: "duplication-internal",
        paths: clone.files,
        characteristic: "duplication",
        penalty: INTERNAL_CLONE_PENALTY,
        signal: `jscpd:internal:${key}`,
        service: services[0],
      });
    } else if (classification === "cross-service") {
      findings.push({
        ruleId: "duplication-cross-service",
        paths: clone.files,
        characteristic: "cross-service-integrity",
        penalty: CROSS_SERVICE_CLONE_PENALTY,
        signal: `jscpd:cross-service:${key}`,
      });
    } else {
      findings.push({
        ruleId: "duplication-shared",
        paths: clone.files,
        characteristic: "cross-service-integrity",
        penalty: SHARED_CLONE_PENALTY,
        signal: `jscpd:shared:${key}`,
      });
    }
  }

  return findings;
}

function applyFindings(
  buckets: Record<string, Bucket>,
  findings: Finding[],
  decisions: AcceptedDecision[],
  characteristicOf: (finding: Finding) => string | undefined,
): void {
  for (const finding of findings) {
    const id = characteristicOf(finding);
    if (id === undefined) {
      continue;
    }
    const bucket = buckets[id];
    if (bucket === undefined) {
      continue;
    }
    const decision = matchingDecision(finding, decisions);
    if (decision !== undefined) {
      bucket.suppressedBy.push(decision.id);
      continue;
    }
    bucket.penalty += finding.penalty;
    bucket.signalsUsed.push(finding.signal);
  }
}

function toCharacteristic(
  id: PlatformCharacteristicId,
  bucket: Bucket,
): CharacteristicScore {
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
}

function weightedOverall(
  characteristics: CharacteristicScore[],
  weights: Record<string, number>,
): number {
  return Math.round(
    characteristics.reduce(
      (sum, item) => sum + item.score * (weights[item.id] ?? 0),
      0,
    ),
  );
}

function serviceSrcFolder(service: string): string {
  return `services/${service}/src`;
}

const LAYER_FOLDERS = ["domain", "infrastructure", "transport"] as const;

export function folderInstabilityForService(
  metrics: FolderMetric[],
  service: string,
): number | undefined {
  const normalised = metrics.map((item) => ({
    ...item,
    folder: item.folder.replace(/\\/g, "/").replace(/\/$/, ""),
  }));
  const layers = LAYER_FOLDERS.map((layer) =>
    normalised.find(
      (item) => item.folder === `${serviceSrcFolder(service)}/${layer}`,
    ),
  ).filter((item): item is FolderMetric => item !== undefined);
  if (layers.length > 0) {
    return (
      layers.reduce((sum, item) => sum + item.instability, 0) / layers.length
    );
  }
  const prefix = `services/${service}/`;
  const coupled = normalised.filter(
    (item) =>
      item.folder.startsWith(prefix) &&
      item.afferentCoupling + item.efferentCoupling > 0,
  );
  if (coupled.length === 0) {
    return undefined;
  }
  return (
    coupled.reduce((sum, item) => sum + item.instability, 0) / coupled.length
  );
}

function instabilityPenalty(
  payload: AnalysisPayload,
  service: string,
): { penalty: number; signal: string } | undefined {
  const instability = folderInstabilityForService(
    payload.dependencyCruiser.folderMetrics,
    service,
  );
  if (instability === undefined) {
    return undefined;
  }
  const penalty = Math.round(instability * INSTABILITY_SCALE);
  if (penalty <= 0) {
    return undefined;
  }
  return {
    penalty,
    signal: `dependency-cruiser:instability:${service}:${instability}`,
  };
}

function meanScore(scores: number[]): number {
  if (scores.length === 0) {
    return 100;
  }
  return Math.round(
    scores.reduce((sum, score) => sum + score, 0) / scores.length,
  );
}

export function score(
  payload: AnalysisPayload,
  decisions: AcceptedDecision[],
): ScoreResult {
  const services = discoverServices(payload.services, payloadFiles(payload));
  const findings = collectFindings(payload);

  const serviceScores: ServiceScore[] = services.map((service) => {
    const buckets = emptyFour();
    applyFindings(
      buckets,
      findings,
      decisions,
      (finding) =>
        finding.service === service &&
        finding.characteristic !== "cross-service-integrity"
          ? finding.characteristic
          : undefined,
    );
    const instability = instabilityPenalty(payload, service);
    if (instability !== undefined) {
      const decision = matchingDecision(
        {
          ruleId: "instability",
          paths: [serviceSrcFolder(service)],
          service,
        },
        decisions,
      );
      if (decision !== undefined) {
        buckets.coupling.suppressedBy.push(decision.id);
      } else {
        buckets.coupling.penalty += instability.penalty;
        buckets.coupling.signalsUsed.push(instability.signal);
      }
    }
    const characteristics = SERVICE_CHARACTERISTIC_ORDER.map((id) =>
      toCharacteristic(id, buckets[id]),
    );
    return {
      service,
      overall: weightedOverall(characteristics, SERVICE_WEIGHTS),
      characteristics,
    };
  });

  const serviceChar = (id: CharacteristicId): number[] =>
    serviceScores.map(
      (item) => item.characteristics.find((char) => char.id === id)?.score ?? 100,
    );

  const rolledBoundary =
    serviceScores.length === 0
      ? 100
      : Math.min(...serviceChar("boundary-integrity"));
  const rolledLayering = meanScore(serviceChar("layering"));
  const rolledCoupling = meanScore(serviceChar("coupling"));
  const rolledDuplication = meanScore(serviceChar("duplication"));

  const csiBucket = emptyBucket();
  applyFindings(
    { "cross-service-integrity": csiBucket },
    findings,
    decisions,
    (finding) =>
      finding.characteristic === "cross-service-integrity"
        ? "cross-service-integrity"
        : undefined,
  );
  const csi = toCharacteristic("cross-service-integrity", csiBucket);

  function rolled(
    id: CharacteristicId,
    value: number,
  ): CharacteristicScore {
    const suppressed = [
      ...new Set(
        serviceScores.flatMap(
          (item) =>
            item.characteristics.find((char) => char.id === id)?.suppressedBy ??
            [],
        ),
      ),
    ].sort();
    const signals = [
      ...new Set(
        serviceScores.flatMap(
          (item) =>
            item.characteristics.find((char) => char.id === id)?.signalsUsed ??
            [],
        ),
      ),
    ].sort();
    const characteristic: CharacteristicScore = {
      id,
      score: value,
      signalsUsed: signals,
    };
    if (suppressed.length > 0) {
      characteristic.suppressedBy = suppressed;
    }
    return characteristic;
  }

  const characteristics: CharacteristicScore[] = [
    rolled("boundary-integrity", rolledBoundary),
    rolled("layering", rolledLayering),
    rolled("coupling", rolledCoupling),
    rolled("duplication", rolledDuplication),
    csi,
  ];

  return {
    overall: weightedOverall(characteristics, PLATFORM_WEIGHTS),
    characteristics,
    services: serviceScores,
  };
}
