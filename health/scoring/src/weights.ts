import type { CharacteristicId } from "./types.js";

export const CHARACTERISTIC_ORDER: CharacteristicId[] = [
  "boundary-integrity",
  "layering",
  "coupling",
  "duplication",
];

export const CHARACTERISTIC_WEIGHTS: Record<CharacteristicId, number> = {
  "boundary-integrity": 0.4,
  layering: 0.3,
  coupling: 0.2,
  duplication: 0.1,
};

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
};

export const CYCLE_PENALTY = 15;
export const ORPHAN_PENALTY = 5;
export const DUPLICATION_THRESHOLD_PERCENT = 5;
export const DUPLICATION_PENALTY_PER_PERCENT = 5;
