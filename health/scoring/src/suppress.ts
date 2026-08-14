import type { AcceptedDecision } from "./types.js";

export function globMatch(glob: string, filePath: string): boolean {
  let pattern = "";
  let i = 0;
  while (i < glob.length) {
    const current = glob[i];
    const next = glob[i + 1];
    if (current === "*" && next === "*") {
      if (glob[i + 2] === "/") {
        pattern += "(?:.*/)?";
        i += 3;
      } else {
        pattern += ".*";
        i += 2;
      }
      continue;
    }
    if (current === "*") {
      pattern += "[^/]*";
      i += 1;
      continue;
    }
    if (current !== undefined && ".+^${}()|[]\\".includes(current)) {
      pattern += `\\${current}`;
      i += 1;
      continue;
    }
    pattern += current ?? "";
    i += 1;
  }
  return new RegExp(`^${pattern}$`).test(filePath);
}

export type MatchableFinding = {
  ruleId: string;
  paths: string[];
  service?: string;
};

export function matchingDecision(
  finding: MatchableFinding,
  decisions: AcceptedDecision[],
): AcceptedDecision | undefined {
  return decisions.find((decision) => {
    if (!decision.active || decision.ruleId !== finding.ruleId) {
      return false;
    }
    const scope = decision.scope ?? "platform";
    if (
      scope !== "platform" &&
      finding.service !== undefined &&
      scope !== finding.service
    ) {
      return false;
    }
    return finding.paths.some((path) => globMatch(decision.pathGlob, path));
  });
}
