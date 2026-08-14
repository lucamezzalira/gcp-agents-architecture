import { filesOfProject } from "tsarch";
import { RULE_IDS, RULE_SET_VERSION, type RuleId } from "./version.js";

export { RULE_IDS, RULE_SET_VERSION, type RuleId };

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

async function combined(
  ruleId: string,
  rules: CheckableRule[],
): Promise<ArchTestResult> {
  const parts = await Promise.all(rules.map((rule) => result(ruleId, rule)));
  return {
    ruleId,
    passed: parts.every((item) => item.passed),
    violations: parts.flatMap((item) => item.violations),
  };
}

export async function checkArchitecture(
  tsConfigFilePath: string,
): Promise<ArchTestResult[]> {
  const files = filesOfProject(tsConfigFilePath);

  const rule1Folder = files
    .inFolder("transport")
    .shouldNot()
    .dependOnFiles()
    .inFolder("infrastructure");

  const rule1Clients = files
    .inFolder("transport")
    .shouldNot()
    .dependOnFiles()
    .matchingPattern(
      ".*src/infrastructure/.*(email-provider|firestore-|gcs-).*",
    );

  // Ports live in domain/ports, which is still under domain/, so
  // inFolder("domain") would also forbid adapters depending on ports.
  // The rule is the folder split: infrastructure may depend on
  // domain/ports and on nothing else under domain.
  const rule2 = files
    .inFolder("infrastructure")
    .shouldNot()
    .dependOnFiles()
    .matchingPattern(".*/domain/(?!ports/).*");

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

  // Store reads are rule 4. Provider access is rule 3. Rule 5 is other internals.
  const rule5Checkout = files
    .matchingPattern(".*services/checkout/.*")
    .shouldNot()
    .dependOnFiles()
    .matchingPattern(
      ".*notification/src/(?!.*(?:[Ss]tore|email-provider)).*",
    );

  const rule5Notification = files
    .matchingPattern(".*services/notification/.*")
    .shouldNot()
    .dependOnFiles()
    .inFolder("checkout");

  const rule6 = files
    .inFolder("domain")
    .shouldNot()
    .dependOnFiles()
    .inFolder("transport");

  const rule7Checkout = files
    .matchingPattern(".*services/checkout/.*/transport/.*")
    .shouldNot()
    .dependOnFiles()
    .matchingPattern(".*services/notification/.*/transport/.*");

  const rule7Notification = files
    .matchingPattern(".*services/notification/.*/transport/.*")
    .shouldNot()
    .dependOnFiles()
    .matchingPattern(".*services/checkout/.*/transport/.*");

  // Mirror of rule 2 from the other side. domain/ports is still domain,
  // so this folder check also keeps ports from depending on infrastructure.
  const rule8 = files
    .inFolder("domain")
    .shouldNot()
    .dependOnFiles()
    .inFolder("infrastructure");

  const rule9 = files
    .inFolder("infrastructure")
    .shouldNot()
    .dependOnFiles()
    .inFolder("transport");

  const [
    r1,
    r2,
    r3,
    r4,
    r5,
    r6,
    r7,
    r8,
    r9,
  ] = await Promise.all([
    combined("rule-1", [rule1Folder, rule1Clients]),
    result("rule-2", rule2),
    result("rule-3", rule3),
    result("rule-4", rule4),
    combined("rule-5", [rule5Checkout, rule5Notification]),
    result("rule-6", rule6),
    combined("rule-7", [rule7Checkout, rule7Notification]),
    result("rule-8", rule8),
    result("rule-9", rule9),
  ]);

  const byId = new Map(
    [r1, r2, r3, r4, r5, r6, r7, r8, r9].map((item) => [item.ruleId, item]),
  );
  return RULE_IDS.map((id) => {
    const found = byId.get(id);
    if (found === undefined) {
      throw new Error(`missing result for ${id}`);
    }
    return found;
  });
}
