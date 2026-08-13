import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analysisPayloadSchema } from "@health/scoring/schemas";
import { checkArchitecture } from "./arch-tests/check.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

function git(command: string[]): string {
  try {
    return execFileSync("git", command, {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

type DepcruiseJson = {
  modules?: Array<{
    source: string;
    dependencies?: Array<{ circular?: boolean; resolved?: string }>;
  }>;
  summary?: {
    violations?: Array<{
      from: string;
      to: string;
      rule: { name: string };
    }>;
    total?: { modules?: number; dependencies?: number };
  };
};

type JscpdJson = {
  statistics?: {
    total?: {
      percentage?: number;
    };
  };
  duplicates?: Array<{
    lines?: number;
    tokens?: number;
    firstFile?: { name?: string };
    secondFile?: { name?: string };
  }>;
};

function runDepcruise(): DepcruiseJson {
  const raw = execFileSync(
    "pnpm",
    [
      "exec",
      "depcruise",
      "--config",
      join(here, ".dependency-cruiser.js"),
      "--output-type",
      "json",
      join(repoRoot, "services"),
    ],
    { cwd: here, encoding: "utf8" },
  );
  return JSON.parse(raw) as DepcruiseJson;
}

function runJscpd(): JscpdJson {
  const outDir = join(here, ".tmp-jscpd");
  mkdirSync(outDir, { recursive: true });
  execFileSync(
    "pnpm",
    [
      "exec",
      "jscpd",
      "--config",
      join(here, ".jscpd.json"),
      "--reporters",
      "json",
      "--output",
      outDir,
      join(repoRoot, "services"),
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  try {
    return JSON.parse(
      readFileSync(join(outDir, "jscpd-report.json"), "utf8"),
    ) as JscpdJson;
  } catch {
    return { statistics: { total: { percentage: 0 } }, duplicates: [] };
  }
}

function cyclesFrom(depcruise: DepcruiseJson): Array<{ path: string[] }> {
  const cycles: Array<{ path: string[] }> = [];
  const seen = new Set<string>();
  for (const module of depcruise.modules ?? []) {
    for (const dep of module.dependencies ?? []) {
      if (dep.circular === true && dep.resolved !== undefined) {
        const key = [module.source, dep.resolved].sort().join(">");
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push({ path: [module.source, dep.resolved] });
        }
      }
    }
  }
  return cycles;
}

async function main(): Promise<void> {
  const tsconfig = join(repoRoot, "tsconfig.arch.json");
  const archTests = await checkArchitecture(tsconfig);
  const depcruise = runDepcruise();
  const jscpd = runJscpd();

  const modules = depcruise.modules ?? [];
  const referenced = new Set(
    modules.flatMap((module) =>
      (module.dependencies ?? [])
        .map((dep) => dep.resolved)
        .filter((item): item is string => item !== undefined),
    ),
  );
  const orphans = modules
    .filter(
      (module) =>
        (module.dependencies?.length ?? 0) === 0 && !referenced.has(module.source),
    )
    .map((module) => module.source);

  const payload = analysisPayloadSchema.parse({
    runId: git(["rev-parse", "HEAD"]) || "local",
    commitSha: git(["rev-parse", "HEAD"]) || "local",
    commitMessage: git(["log", "-1", "--format=%s"]) || "uncommitted",
    timestamp: new Date().toISOString(),
    archTests,
    dependencyCruiser: {
      cycles: cyclesFrom(depcruise),
      orphans,
      violations: (depcruise.summary?.violations ?? []).map((item) => ({
        rule: item.rule.name,
        from: item.from,
        to: item.to,
      })),
      metrics: {
        modules: depcruise.summary?.total?.modules ?? modules.length,
        dependencies: depcruise.summary?.total?.dependencies ?? 0,
      },
    },
    duplication: {
      clones: (jscpd.duplicates ?? []).map((dup) => ({
        files: [dup.firstFile?.name ?? "", dup.secondFile?.name ?? ""].filter(
          (name) => name.length > 0,
        ),
        lines: dup.lines ?? 0,
        tokens: dup.tokens ?? 0,
      })),
      percentage: jscpd.statistics?.total?.percentage ?? 0,
    },
    runtime: {
      illustrative: true as const,
      signals: [
        { name: "p95-latency", value: 120, unit: "ms" },
        { name: "error-rate", value: 0.01, unit: "ratio" },
      ],
    },
  });

  const outPath = process.argv[2] ?? join(repoRoot, "analysis", "payload.json");
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
  process.stdout.write(outPath + "\n");
}

void main();
