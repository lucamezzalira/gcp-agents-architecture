import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyClone } from "@health/scoring/classify";
import { analysisPayloadSchema } from "@health/scoring/schemas";
import { serviceFromPath } from "@health/scoring/types";
import { checkArchitecture, RULE_SET_VERSION } from "./arch-tests/check.js";
import { buildRuntimePayload } from "./runtime-graph.js";

const here = dirname(fileURLToPath(import.meta.url));
const defaultRoot = join(here, "..");
const args = process.argv.slice(2).filter((item) => item !== "--");
const outPath = args[0] ?? join(defaultRoot, "analysis", "payload.json");
const repoRoot = args[1] ?? defaultRoot;

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

type FolderRecord = {
  afferentCouplings?: number;
  efferentCouplings?: number;
  instability?: number;
  moduleCount?: number;
  name?: string;
};

type DepcruiseJson = {
  modules?: Array<{
    source: string;
    orphan?: boolean;
    dependencies?: Array<{ circular?: boolean; resolved?: string }>;
  }>;
  folders?: Record<string, FolderRecord> | FolderRecord[];
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
    join(here, "node_modules", ".bin", "depcruise"),
    [
      "--config",
      join(here, ".dependency-cruiser.js"),
      "--metrics",
      "--output-type",
      "json",
      "services",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return JSON.parse(raw) as DepcruiseJson;
}

function changedFiles(): string[] {
  const raw = git(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]);
  if (raw.length === 0) {
    return [];
  }
  return raw.split("\n").filter((line) => line.length > 0);
}

function recentCommits(): Array<{ sha: string; message: string }> {
  const raw = git(["log", "-8", "--format=%H%x09%s"]);
  if (raw.length === 0) {
    return [];
  }
  return raw.split("\n").flatMap((line) => {
    const tab = line.indexOf("\t");
    if (tab < 0) {
      return [];
    }
    return [{ sha: line.slice(0, tab), message: line.slice(tab + 1) }];
  });
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
    { cwd: here, encoding: "utf8" },
  );
  try {
    return JSON.parse(
      readFileSync(join(outDir, "jscpd-report.json"), "utf8"),
    ) as JscpdJson;
  } catch {
    return { statistics: { total: { percentage: 0 } }, duplicates: [] };
  }
}

function relativize(file: string): string {
  const normalised = file.replace(/\\/g, "/");
  const rootNorm = repoRoot.replace(/\\/g, "/").replace(/\/$/, "");
  if (normalised.startsWith(`${rootNorm}/`)) {
    return normalised.slice(rootNorm.length + 1);
  }
  const servicesAt = normalised.indexOf("/services/");
  if (servicesAt >= 0) {
    return normalised.slice(servicesAt + 1);
  }
  return normalised;
}

function listedServices(): string[] {
  try {
    return readdirSync(join(repoRoot, "services"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function folderMetrics(
  depcruise: DepcruiseJson,
): Array<{
  folder: string;
  afferentCoupling: number;
  efferentCoupling: number;
  instability: number;
  moduleCount?: number;
}> {
  const folders = depcruise.folders;
  if (folders === undefined) {
    return [];
  }
  const entries: Array<[string, FolderRecord]> = Array.isArray(folders)
    ? folders.map((item) => [item.name ?? "", item])
    : Object.entries(folders);
  return entries
    .filter(([folder]) => folder.length > 0)
    .map(([folder, item]) => ({
      folder: relativize(folder),
      afferentCoupling: item.afferentCouplings ?? 0,
      efferentCoupling: item.efferentCouplings ?? 0,
      instability: item.instability ?? 0,
      moduleCount: item.moduleCount,
    }));
}

function serviceMetricsFromModules(
  modules: Array<{
    source: string;
    dependencies?: Array<{ resolved?: string }>;
  }>,
  services: string[],
): Array<{
  service: string;
  afferentCoupling: number;
  efferentCoupling: number;
}> {
  return services.map((service) => {
    const prefix = `services/${service}/`;
    const ce = new Set<string>();
    const ca = new Set<string>();
    for (const module of modules) {
      const source = relativize(module.source);
      const inside = source.startsWith(prefix);
      for (const dep of module.dependencies ?? []) {
        if (dep.resolved === undefined || dep.resolved.length === 0) {
          continue;
        }
        const resolved = relativize(dep.resolved);
        if (inside && !resolved.startsWith(prefix)) {
          ce.add(resolved);
        } else if (!inside && resolved.startsWith(prefix)) {
          ca.add(source);
        }
      }
    }
    return {
      service,
      afferentCoupling: ca.size,
      efferentCoupling: ce.size,
    };
  });
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
  const archTests = (await checkArchitecture(tsconfig)).map((test) => ({
    ...test,
    violations: test.violations.map((violation) => ({
      ...violation,
      file: relativize(violation.file),
      service: serviceFromPath(relativize(violation.file)),
    })),
  }));
  const depcruise = runDepcruise();
  const jscpd = runJscpd();

  const modules = depcruise.modules ?? [];
  const orphanViolations = (depcruise.summary?.violations ?? [])
    .filter((item) => item.rule.name === "no-orphans")
    .map((item) => item.from);
  const orphans = [
    ...new Set([
      ...orphanViolations,
      ...modules
        .filter((module) => module.orphan === true)
        .map((module) => module.source),
    ]),
  ].sort();
  const dependencyCount = modules.reduce(
    (sum, module) => sum + (module.dependencies?.length ?? 0),
    0,
  );

  const clones = (jscpd.duplicates ?? []).map((dup) => {
    const files = [dup.firstFile?.name ?? "", dup.secondFile?.name ?? ""]
      .filter((name) => name.length > 0)
      .map(relativize);
    const classified = classifyClone(files);
    return {
      files,
      lines: dup.lines ?? 0,
      tokens: dup.tokens ?? 0,
      classification: classified.classification,
      services: classified.services,
    };
  });

  const payload = analysisPayloadSchema.parse({
    runId: git(["rev-parse", "HEAD"]) || "local",
    commitSha: git(["rev-parse", "HEAD"]) || "local",
    commitMessage: git(["log", "-1", "--format=%s"]) || "uncommitted",
    timestamp: new Date().toISOString(),
    services: listedServices(),
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
        modules: modules.length,
        dependencies: dependencyCount,
      },
      folderMetrics: folderMetrics(depcruise),
      serviceMetrics: serviceMetricsFromModules(modules, listedServices()),
    },
    duplication: {
      clones,
      percentage: jscpd.statistics?.total?.percentage ?? 0,
    },
    runtime: await buildRuntimePayload({
      modules,
      relativize,
      services: listedServices(),
    }),
    recentCommits: recentCommits(),
    changedFiles: changedFiles(),
    ruleSetVersion: RULE_SET_VERSION,
  });

  writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
  process.stdout.write(outPath + "\n");
}

void main();
