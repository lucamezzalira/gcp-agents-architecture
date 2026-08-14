import { classifyClone } from "./classify.js";
import { matchingDecision } from "./suppress.js";
import { discoverServices, serviceFromPath } from "./paths.js";
import type {
  AcceptedDecision,
  AnalysisPayload,
  CharacteristicId,
  CharacteristicScore,
  DuplicationCounts,
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
  EFFERENT_GROWTH_PENALTY,
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

  findings.push(...duplicationFindings(payload));
  findings.push(...efferentGrowthFindings(payload));

  return findings;
}

type CountedClone = {
  files: string[];
  classification: "internal" | "cross-service" | "shared";
  services: string[];
};

function scoredClones(payload: AnalysisPayload): CountedClone[] {
  const clones: CountedClone[] = [];
  for (const clone of payload.duplication.clones) {
    const uniqueFiles = [...new Set(clone.files)];
    if (uniqueFiles.length < 2) {
      continue;
    }
    const classified = classifyClone(clone.files);
    clones.push({
      files: clone.files,
      classification: clone.classification ?? classified.classification,
      services: clone.services ?? classified.services,
    });
  }
  return clones;
}

function currentDuplicationCounts(payload: AnalysisPayload): DuplicationCounts {
  const internalByService: Record<string, number> = {};
  let internal = 0;
  let crossService = 0;
  let shared = 0;
  for (const clone of scoredClones(payload)) {
    if (clone.classification === "internal" && clone.services[0] !== undefined) {
      internal += 1;
      const service = clone.services[0];
      internalByService[service] = (internalByService[service] ?? 0) + 1;
    } else if (clone.classification === "cross-service") {
      crossService += 1;
    } else {
      shared += 1;
    }
  }
  return { internal, crossService, shared, internalByService };
}

function cloneFiles(
  clones: CountedClone[],
  classification: CountedClone["classification"],
  service?: string,
): string[] {
  return clones
    .filter((clone) => {
      if (clone.classification !== classification) {
        return false;
      }
      if (service === undefined) {
        return true;
      }
      return clone.services[0] === service;
    })
    .flatMap((clone) => clone.files);
}

function duplicationFindings(payload: AnalysisPayload): Finding[] {
  const clones = scoredClones(payload);
  const prior = payload.priorDuplicationCounts;
  if (prior === undefined) {
    return baselineCloneFindings(clones);
  }
  return growthCloneFindings(clones, currentDuplicationCounts(payload), prior);
}

function baselineCloneFindings(clones: CountedClone[]): Finding[] {
  const findings: Finding[] = [];
  for (const clone of clones) {
    const key = clone.files.slice().sort().join("|");
    if (clone.classification === "internal" && clone.services[0] !== undefined) {
      findings.push({
        ruleId: "duplication-internal",
        paths: clone.files,
        characteristic: "duplication",
        penalty: INTERNAL_CLONE_PENALTY,
        signal: `jscpd:internal:${key}`,
        service: clone.services[0],
      });
    } else if (clone.classification === "cross-service") {
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

function growthCloneFindings(
  clones: CountedClone[],
  current: DuplicationCounts,
  prior: DuplicationCounts,
): Finding[] {
  const findings: Finding[] = [];
  const services = new Set([
    ...Object.keys(current.internalByService),
    ...Object.keys(prior.internalByService ?? {}),
  ]);
  for (const service of services) {
    const currentCount = current.internalByService[service] ?? 0;
    const priorCount = prior.internalByService?.[service] ?? 0;
    const growth = Math.max(0, currentCount - priorCount);
    if (growth === 0) {
      continue;
    }
    findings.push({
      ruleId: "duplication-internal",
      paths: cloneFiles(clones, "internal", service),
      characteristic: "duplication",
      penalty: growth * INTERNAL_CLONE_PENALTY,
      signal: `jscpd:internal-growth:${service}:${priorCount}->${currentCount}`,
      service,
    });
  }
  const crossGrowth = Math.max(0, current.crossService - prior.crossService);
  if (crossGrowth > 0) {
    findings.push({
      ruleId: "duplication-cross-service",
      paths: cloneFiles(clones, "cross-service"),
      characteristic: "cross-service-integrity",
      penalty: crossGrowth * CROSS_SERVICE_CLONE_PENALTY,
      signal: `jscpd:cross-service-growth:${prior.crossService}->${current.crossService}`,
    });
  }
  const sharedGrowth = Math.max(0, current.shared - prior.shared);
  if (sharedGrowth > 0) {
    findings.push({
      ruleId: "duplication-shared",
      paths: cloneFiles(clones, "shared"),
      characteristic: "cross-service-integrity",
      penalty: sharedGrowth * SHARED_CLONE_PENALTY,
      signal: `jscpd:shared-growth:${prior.shared}->${current.shared}`,
    });
  }
  return findings;
}

function efferentGrowthFindings(payload: AnalysisPayload): Finding[] {
  const findings: Finding[] = [];
  const priors = payload.priorServiceMetrics ?? [];
  if (priors.length === 0) {
    return findings;
  }
  for (const current of payload.dependencyCruiser.serviceMetrics ?? []) {
    const prior = priors.find((item) => item.service === current.service);
    if (prior === undefined) {
      continue;
    }
    const growth = Math.max(0, current.efferentCoupling - prior.efferentCoupling);
    if (growth === 0) {
      continue;
    }
    findings.push({
      ruleId: "efferent-growth",
      paths: [`services/${current.service}/`],
      characteristic: "coupling",
      penalty: growth * EFFERENT_GROWTH_PENALTY,
      signal: `dependency-cruiser:efferent-growth:${current.service}:${prior.efferentCoupling}->${current.efferentCoupling}`,
      service: current.service,
    });
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

  const rolledBoundary = meanScore(serviceChar("boundary-integrity"));
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
