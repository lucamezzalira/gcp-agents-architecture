import type { CharacteristicId, PlatformCharacteristicId } from "./types.js";

export const SERVICE_CHARACTERISTIC_ORDER: CharacteristicId[] = [
  "boundary-integrity",
  "layering",
  "coupling",
  "duplication",
];

export const PLATFORM_CHARACTERISTIC_ORDER: PlatformCharacteristicId[] = [
  "boundary-integrity",
  "layering",
  "coupling",
  "duplication",
  "cross-service-integrity",
];

/** @deprecated Use SERVICE_CHARACTERISTIC_ORDER. Kept for existing imports. */
export const CHARACTERISTIC_ORDER = SERVICE_CHARACTERISTIC_ORDER;

export const SERVICE_WEIGHTS: Record<CharacteristicId, number> = {
  "boundary-integrity": 0.4,
  layering: 0.3,
  coupling: 0.2,
  duplication: 0.1,
};

export const PLATFORM_WEIGHTS: Record<PlatformCharacteristicId, number> = {
  "boundary-integrity": 0.3,
  layering: 0.2,
  coupling: 0.15,
  duplication: 0.1,
  "cross-service-integrity": 0.25,
};

/** @deprecated Use SERVICE_WEIGHTS. */
export const CHARACTERISTIC_WEIGHTS = SERVICE_WEIGHTS;

export type ArchPenalty = {
  characteristic: CharacteristicId;
  penalty: number;
};

export const ARCH_PENALTIES: Record<string, ArchPenalty> = {
  "rule-1": { characteristic: "layering", penalty: 20 },
  "rule-2": { characteristic: "layering", penalty: 20 },
  "rule-3": { characteristic: "boundary-integrity", penalty: 40 },
  "rule-4": { characteristic: "boundary-integrity", penalty: 30 },
  "rule-5": { characteristic: "boundary-integrity", penalty: 25 },
  "rule-6": { characteristic: "layering", penalty: 20 },
  "rule-7": { characteristic: "boundary-integrity", penalty: 25 },
  "rule-8": { characteristic: "layering", penalty: 20 },
  "rule-9": { characteristic: "layering", penalty: 20 },
  "rule-10": { characteristic: "boundary-integrity", penalty: 25 },
};

export const CROSS_SERVICE_RULES = new Set([
  "rule-3",
  "rule-4",
  "rule-5",
  "rule-7",
]);

export const CYCLE_PENALTY = 15;
export const ORPHAN_PENALTY = 5;
export const UNRESOLVABLE_PENALTY = 10;
export const DEP_ON_TEST_PENALTY = 10;
/** Penalty per extra outgoing edge vs the prior run. Decrease is not scored. */
export const EFFERENT_GROWTH_PENALTY = 10;
export const INTERNAL_CLONE_PENALTY = 8;
export const CROSS_SERVICE_CLONE_PENALTY = 10;
export const SHARED_CLONE_PENALTY = 8;

/** Services below this overall are counted as in trouble on the platform view. */
export const SERVICE_SPREAD_THRESHOLD = 80;
