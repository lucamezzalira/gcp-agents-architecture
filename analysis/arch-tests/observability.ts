import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { ArchTestResult, ArchViolation } from "./check.js";

const PACKAGE = "@observability/runtime";

const FORBIDDEN_IMPORTS = [
  "@opentelemetry/sdk-trace-node",
  "@opentelemetry/sdk-trace-base",
  "@opentelemetry/sdk-node",
  "@google-cloud/opentelemetry-cloud-trace-exporter",
  "@opentelemetry/instrumentation",
  "@opentelemetry/instrumentation-http",
  "@opentelemetry/resources",
  "@opentelemetry/core",
  "@opentelemetry/api",
];

const IMPORT_FROM = /(?:from|import)\s+["']([^"']+)["']/g;
const LOCAL_LOGGER =
  /\b(?:export\s+)?(?:async\s+)?(?:function|const)\s+(createJsonLogger|silentLogger)\b/;
const SUBCLASS_OR_IMPLEMENTS =
  /\bclass\s+\w+[^{]*\b(?:extends|implements)\b[^{]*\b(?:Logger|CorrelatedLogger)\b/;
const REEXPORT_PACKAGE = new RegExp(
  `export\\s+(?:\\*|\\{[^}]*\\})\\s+from\\s+["']${PACKAGE.replace("/", "\\/")}["']`,
);

async function listTsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listTsFiles(full)));
      continue;
    }
    if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

async function serviceNames(servicesRoot: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(servicesRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    try {
      const src = await stat(join(servicesRoot, entry.name, "src"));
      if (src.isDirectory()) {
        names.push(entry.name);
      }
    } catch {
      continue;
    }
  }
  return names.sort();
}

function importedModules(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT_FROM)) {
    const spec = match[1];
    if (spec !== undefined) {
      found.push(spec);
    }
  }
  return found;
}

function posixRel(root: string, file: string): string {
  return relative(root, file).split("\\").join("/");
}

export async function checkObservability(
  tsConfigFilePath: string,
): Promise<ArchTestResult> {
  const root = dirname(tsConfigFilePath);
  const servicesRoot = join(root, "services");
  const violations: ArchViolation[] = [];
  const names = await serviceNames(servicesRoot);

  for (const name of names) {
    const srcRoot = join(servicesRoot, name, "src");
    const files = await listTsFiles(srcRoot);
    let importsPackage = false;
    for (const file of files) {
      const source = await readFile(file, "utf8");
      const rel = posixRel(root, file);
      const imports = importedModules(source);
      if (imports.includes(PACKAGE)) {
        importsPackage = true;
      }
      for (const spec of imports) {
        if (FORBIDDEN_IMPORTS.includes(spec)) {
          violations.push({
            file: rel,
            detail: `imports ${spec}; tracing and logging belong in ${PACKAGE}`,
          });
        }
      }
      if (LOCAL_LOGGER.test(source)) {
        violations.push({
          file: rel,
          detail: `defines a local logger factory; import ${PACKAGE} as-is`,
        });
      }
      if (SUBCLASS_OR_IMPLEMENTS.test(source)) {
        violations.push({
          file: rel,
          detail: `subclasses or implements the observability logger; import ${PACKAGE} as-is`,
        });
      }
      if (REEXPORT_PACKAGE.test(source)) {
        violations.push({
          file: rel,
          detail: `re-exports ${PACKAGE}; import the package at the call site`,
        });
      }
    }
    if (!importsPackage) {
      violations.push({
        file: `services/${name}/src`,
        detail: `does not import ${PACKAGE}`,
      });
    }
  }

  return {
    ruleId: "rule-10",
    passed: violations.length === 0,
    violations,
  };
}
