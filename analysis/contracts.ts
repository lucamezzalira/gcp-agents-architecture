import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { serviceFromPath } from "@health/scoring/types";

export type MessageContract = {
  name: string;
  fields: string[];
  publishers: string[];
  consumers: string[];
};

const CONTRACT_FILE =
  /(^|\/)(send-instruction|[a-z0-9-]+-(command|outcome))\.ts$/i;

function isTsSource(name: string): boolean {
  return name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts");
}

function walkTs(dir: string): string[] {
  const found: string[] = [];
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") {
        continue;
      }
      found.push(...walkTs(path));
      continue;
    }
    if (entry.isFile() && isTsSource(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

function relativize(file: string, repoRoot: string): string {
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

function extractFields(source: string, typeName: string): string[] {
  const typeBody = source.match(
    new RegExp(`export type ${typeName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`),
  )?.[1];
  if (typeBody !== undefined) {
    return [
      ...new Set(
        [...typeBody.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\s*[?:]/gm)].map(
          (match) => match[1],
        ),
      ),
    ];
  }
  const schemaName = `${typeName.charAt(0).toLowerCase()}${typeName.slice(1)}Schema`;
  const fromNamedSchema = source.match(
    new RegExp(`${schemaName}\\s*=\\s*z\\.object\\(\\{([\\s\\S]*?)\\n\\}\\)`),
  )?.[1];
  if (fromNamedSchema !== undefined) {
    return [
      ...new Set(
        [...fromNamedSchema.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\s*:/gm)].map(
          (match) => match[1],
        ),
      ),
    ];
  }
  const objectMatch = source.match(/z\.object\(\{([\s\S]*?)\n\}\)/);
  const body = objectMatch?.[1];
  if (body === undefined) {
    return [];
  }
  return [
    ...new Set(
      [...body.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\s*:/gm)].map(
        (match) => match[1],
      ),
    ),
  ];
}

function typeNameFromFile(fileName: string): string {
  return fileName
    .replace(/\.ts$/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function extractTypeName(source: string, fileName: string): string | undefined {
  const fromFile = typeNameFromFile(fileName);
  if (
    new RegExp(`export type ${fromFile}\\b`).test(source) ||
    new RegExp(`type ${fromFile}\\s*=`).test(source)
  ) {
    return fromFile;
  }
  const exported = source.match(/export type ([A-Z][A-Za-z0-9]*)/);
  if (exported?.[1] !== undefined) {
    return exported[1];
  }
  return fromFile;
}

/** True when a publish method takes this contract type as a parameter. */
function mentionsPublish(source: string, typeName: string): boolean {
  const typed = new RegExp(
    `(?:async\\s+)?publish\\s*\\(\\s*[A-Za-z_][\\w]*\\s*:\\s*${typeName}\\b`,
  );
  return typed.test(source);
}

function mentionsConsume(source: string, typeName: string): boolean {
  if (source.includes(`parse${typeName}`)) {
    return true;
  }
  const schemaName = `${typeName.charAt(0).toLowerCase()}${typeName.slice(1)}Schema`;
  return source.includes(`${schemaName}.safeParse`);
}

export function extractContracts(repoRoot: string): MessageContract[] {
  const servicesRoot = join(repoRoot, "services");
  const files = walkTs(servicesRoot);
  type Acc = {
    fields: Set<string>;
    publishers: Set<string>;
    consumers: Set<string>;
  };
  const byName = new Map<string, Acc>();

  for (const file of files) {
    const rel = relativize(file, repoRoot);
    if (!CONTRACT_FILE.test(rel.replace(/\\/g, "/"))) {
      continue;
    }
    const service = serviceFromPath(rel);
    if (service === undefined) {
      continue;
    }
    const source = readFileSync(file, "utf8");
    const name = extractTypeName(source, file.split("/").pop() ?? "");
    if (name === undefined) {
      continue;
    }
    const current = byName.get(name) ?? {
      fields: new Set<string>(),
      publishers: new Set<string>(),
      consumers: new Set<string>(),
    };
    for (const field of extractFields(source, name)) {
      current.fields.add(field);
    }
    byName.set(name, current);
  }

  for (const file of files) {
    const rel = relativize(file, repoRoot);
    const service = serviceFromPath(rel);
    if (service === undefined) {
      continue;
    }
    const source = readFileSync(file, "utf8");
    for (const [name, current] of byName) {
      if (mentionsPublish(source, name)) {
        current.publishers.add(service);
      }
      if (mentionsConsume(source, name)) {
        current.consumers.add(service);
      }
    }
  }

  return [...byName.entries()]
    .map(([name, current]) => ({
      name,
      fields: [...current.fields],
      publishers: [...current.publishers].sort(),
      consumers: [...current.consumers]
        .filter((item) => !current.publishers.has(item))
        .sort(),
    }))
    .filter(
      (item) =>
        item.fields.length > 0 &&
        item.publishers.length + item.consumers.length > 0,
    )
    .sort((left, right) => left.name.localeCompare(right.name));
}
