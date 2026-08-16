export const RULE_SET_VERSION = 8;

export const RULE_IDS = [
  "rule-1",
  "rule-2",
  "rule-3",
  "rule-4",
  "rule-5",
  "rule-6",
  "rule-7",
  "rule-8",
  "rule-9",
  "rule-10",
] as const;

export type RuleId = (typeof RULE_IDS)[number];
