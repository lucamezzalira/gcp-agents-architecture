import { filesOfProject } from "tsarch";

export type ArchViolation = {
  file: string;
  detail: string;
};

export type ArchTestResult = {
  ruleId: string;
  passed: boolean;
  violations: ArchViolation[];
};

type CheckableRule = {
  check: () => Promise<unknown[]>;
};

type FileDependencyViolation = {
  dependency: {
    sourceLabel: string;
    targetLabel: string;
  };
};

function isFileDependency(
  value: unknown,
): value is FileDependencyViolation {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("dependency" in value)) {
    return false;
  }
  const dependency = (value as { dependency: unknown }).dependency;
  if (typeof dependency !== "object" || dependency === null) {
    return false;
  }
  const record = dependency as { sourceLabel?: unknown; targetLabel?: unknown };
  return (
    typeof record.sourceLabel === "string" &&
    typeof record.targetLabel === "string"
  );
}

function toViolations(raw: unknown[]): ArchViolation[] {
  return raw.map((item) => {
    if (isFileDependency(item)) {
      return {
        file: item.dependency.sourceLabel,
        detail: `depends on ${item.dependency.targetLabel}`,
      };
    }
    return { file: "unknown", detail: JSON.stringify(item) };
  });
}

async function result(
  ruleId: string,
  rule: CheckableRule,
): Promise<ArchTestResult> {
  const violations = toViolations(await rule.check());
  return {
    ruleId,
    passed: violations.length === 0,
    violations,
  };
}

export async function checkArchitecture(
  tsConfigFilePath: string,
): Promise<ArchTestResult[]> {
  const files = filesOfProject(tsConfigFilePath);

  const rule1 = files
    .inFolder("transport")
    .shouldNot()
    .dependOnFiles()
    .inFolder("infrastructure");

  const rule2 = files
    .inFolder("infrastructure")
    .shouldNot()
    .dependOnFiles()
    .matchingPattern(".*(deliver|mark-paid|render-confirmation)\\.(ts|js)$");

  const rule3 = files
    .matchingPattern(".*services/(?!notification)[^/]+/.*")
    .shouldNot()
    .dependOnFiles()
    .matchingPattern(".*email-provider.*");

  const rule4 = files
    .matchingPattern(".*services/checkout/.*")
    .shouldNot()
    .dependOnFiles()
    .matchingPattern(".*notification/src/.*/.*(store|Store).*");

  // Store reads are scored as rule 4. Rule 5 covers other cross-service internals.
  const rule5 = files
    .matchingPattern(".*services/checkout/.*")
    .shouldNot()
    .dependOnFiles()
    .matchingPattern(".*notification/src/(?!.*[Ss]tore).*");

  const notificationToCheckout = files
    .matchingPattern(".*services/notification/.*")
    .shouldNot()
    .dependOnFiles()
    .inFolder("checkout");

  const [r1, r2, r3, r4, r5a, r5b] = await Promise.all([
    result("rule-1", rule1),
    result("rule-2", rule2),
    result("rule-3", rule3),
    result("rule-4", rule4),
    result("rule-5", rule5),
    result("rule-5", notificationToCheckout),
  ]);

  const rule5Combined: ArchTestResult = {
    ruleId: "rule-5",
    passed: r5a.passed && r5b.passed,
    violations: [...r5a.violations, ...r5b.violations],
  };

  return [r1, r2, r3, r4, rule5Combined];
}
