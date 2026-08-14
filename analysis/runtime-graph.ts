import {
  CALL_GRAPH_DESCRIPTION,
  ILLUSTRATIVE_RUNTIME_SIGNALS,
  emptyRuntimeCallGraph,
  type analysisPayloadSchema,
} from "@health/scoring/schemas";
import { serviceFromPath } from "@health/scoring/types";
import type { z } from "zod";

export type RuntimePayload = z.infer<
  typeof analysisPayloadSchema
>["runtime"];

export type ServiceEdge = {
  from: string;
  to: string;
};

export type RuntimeEdge = ServiceEdge & {
  protocol: "http" | "pubsub";
  count: number;
};

export type TraceSpan = {
  spanId?: string;
  parentSpanId?: string;
  name?: string;
  labels?: Record<string, string>;
};

export type CloudTrace = {
  traceId?: string;
  spans?: TraceSpan[];
};

const DEFAULT_SERVICES = new Set([
  "checkout",
  "notification",
  "inventory",
  "audit",
]);
const PROTOCOL_VALUES = new Set(["http", "pubsub"]);

export function importServiceEdges(
  modules: Array<{
    source: string;
    dependencies?: Array<{ resolved?: string }>;
  }>,
  relativize: (file: string) => string,
): ServiceEdge[] {
  const seen = new Set<string>();
  const edges: ServiceEdge[] = [];
  for (const module of modules) {
    const from = serviceFromPath(relativize(module.source));
    if (from === undefined) {
      continue;
    }
    for (const dep of module.dependencies ?? []) {
      if (dep.resolved === undefined || dep.resolved.length === 0) {
        continue;
      }
      const to = serviceFromPath(relativize(dep.resolved));
      if (to === undefined || to === from) {
        continue;
      }
      const key = `${from}>${to}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      edges.push({ from, to });
    }
  }
  return edges.sort((left, right) =>
    `${left.from}:${left.to}`.localeCompare(`${right.from}:${right.to}`),
  );
}

function label(span: TraceSpan, key: string): string | undefined {
  const labels = span.labels ?? {};
  const candidates = [key, `/${key}`, `ot/${key}`];
  for (const candidate of candidates) {
    const value = labels[candidate];
    if (value !== undefined && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function protocolOf(span: TraceSpan): "http" | "pubsub" {
  const raw = label(span, "ga.protocol");
  if (raw !== undefined && PROTOCOL_VALUES.has(raw)) {
    return raw as "http" | "pubsub";
  }
  const name = span.name ?? "";
  if (name.includes("pubsub") || name.includes("publish") || name.includes("consume")) {
    return "pubsub";
  }
  return "http";
}

function known(
  name: string | undefined,
  allowed: Set<string>,
): string | undefined {
  if (name === undefined || !allowed.has(name)) {
    return undefined;
  }
  return name;
}

export function edgesFromSpans(
  traces: CloudTrace[],
  services: Iterable<string> = DEFAULT_SERVICES,
): RuntimeEdge[] {
  const allowed = new Set(services);
  const counts = new Map<string, RuntimeEdge>();
  const add = (from: string, to: string, protocol: "http" | "pubsub"): void => {
    if (from === to) {
      return;
    }
    const key = `${from}>${to}:${protocol}`;
    const existing = counts.get(key);
    if (existing !== undefined) {
      existing.count += 1;
      return;
    }
    counts.set(key, { from, to, protocol, count: 1 });
  };

  for (const trace of traces) {
    const byId = new Map<string, TraceSpan>();
    for (const span of trace.spans ?? []) {
      if (span.spanId !== undefined) {
        byId.set(span.spanId, span);
      }
      const service = known(label(span, "ga.service"), allowed);
      const peer = known(label(span, "ga.peer"), allowed);
      const kind = label(span, "ga.kind");
      if (service !== undefined && peer !== undefined) {
        if (kind === "client" || kind === "producer") {
          add(service, peer, protocolOf(span));
        } else if (kind === "server" || kind === "consumer") {
          add(peer, service, protocolOf(span));
        }
      }
    }
    for (const span of trace.spans ?? []) {
      if (span.parentSpanId === undefined) {
        continue;
      }
      const parent = byId.get(span.parentSpanId);
      if (parent === undefined) {
        continue;
      }
      const childService = known(label(span, "ga.service"), allowed);
      const parentService = known(label(parent, "ga.service"), allowed);
      if (
        childService === undefined ||
        parentService === undefined ||
        childService === parentService
      ) {
        continue;
      }
      add(parentService, childService, protocolOf(span));
    }
  }

  return [...counts.values()].sort((left, right) =>
    `${left.from}:${left.to}:${left.protocol}`.localeCompare(
      `${right.from}:${right.to}:${right.protocol}`,
    ),
  );
}

export function diffAgainstImports(
  runtime: RuntimeEdge[],
  imports: ServiceEdge[],
): {
  runtimeOnly: Array<Pick<RuntimeEdge, "from" | "to" | "protocol">>;
  importOnly: ServiceEdge[];
} {
  const importKeys = new Set(imports.map((edge) => `${edge.from}>${edge.to}`));
  const runtimeKeys = new Set(runtime.map((edge) => `${edge.from}>${edge.to}`));
  const runtimeOnlySeen = new Set<string>();
  const runtimeOnly: Array<Pick<RuntimeEdge, "from" | "to" | "protocol">> = [];
  for (const edge of runtime) {
    const key = `${edge.from}>${edge.to}`;
    if (importKeys.has(key) || runtimeOnlySeen.has(`${key}:${edge.protocol}`)) {
      continue;
    }
    runtimeOnlySeen.add(`${key}:${edge.protocol}`);
    runtimeOnly.push({
      from: edge.from,
      to: edge.to,
      protocol: edge.protocol,
    });
  }
  const importOnly = imports.filter(
    (edge) => !runtimeKeys.has(`${edge.from}>${edge.to}`),
  );
  return { runtimeOnly, importOnly };
}

type TraceListResponse = {
  traces?: CloudTrace[];
  nextPageToken?: string;
};

export async function queryCloudTraces(options: {
  projectId: string;
  start: Date;
  end: Date;
  fetchImpl?: typeof fetch;
  token?: string;
}): Promise<{ traces: CloudTrace[]; queried: boolean }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const traces: CloudTrace[] = [];
  let pageToken: string | undefined;
  try {
    const token = options.token ?? (await adcAccessToken());
    if (token === undefined) {
      return { traces: [], queried: false };
    }
    for (let page = 0; page < 10; page += 1) {
      const url = new URL(
        `https://cloudtrace.googleapis.com/v1/projects/${options.projectId}/traces`,
      );
      url.searchParams.set("view", "COMPLETE");
      url.searchParams.set("pageSize", "100");
      url.searchParams.set("startTime", options.start.toISOString());
      url.searchParams.set("endTime", options.end.toISOString());
      if (pageToken !== undefined) {
        url.searchParams.set("pageToken", pageToken);
      }
      const response = await fetchImpl(url, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        return { traces: [], queried: false };
      }
      const body = (await response.json()) as TraceListResponse;
      traces.push(...(body.traces ?? []));
      if (body.nextPageToken === undefined || body.nextPageToken.length === 0) {
        break;
      }
      pageToken = body.nextPageToken;
    }
    return { traces, queried: true };
  } catch {
    return { traces: [], queried: false };
  }
}

async function adcAccessToken(): Promise<string | undefined> {
  try {
    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const client = await auth.getClient();
    const got = await client.getAccessToken();
    if (typeof got === "string") {
      return got;
    }
    if (got !== null && typeof got === "object" && "token" in got) {
      const token = got.token;
      return typeof token === "string" ? token : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

const TRAFFIC_VALUES = new Set(["this-run", "inherited", "none"]);

function trafficFromEnv(queried: boolean): "this-run" | "inherited" | "none" {
  const raw = process.env.TRACE_TRAFFIC;
  if (raw !== undefined && TRAFFIC_VALUES.has(raw)) {
    return raw as "this-run" | "inherited" | "none";
  }
  if (queried) {
    return "inherited";
  }
  return "none";
}

function windowStartFromEnv(now: Date, fallbackMinutes: number): Date {
  const raw = process.env.TRACE_WINDOW_START;
  if (raw !== undefined && raw.length > 0) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date(now.getTime() - fallbackMinutes * 60_000);
}

export async function buildRuntimePayload(options: {
  modules: Array<{
    source: string;
    dependencies?: Array<{ resolved?: string }>;
  }>;
  relativize: (file: string) => string;
  services?: string[];
  projectId?: string;
  now?: Date;
  windowMinutes?: number;
  windowStart?: Date;
  traces?: CloudTrace[];
  queried?: boolean;
  traffic?: "this-run" | "inherited" | "none";
}): Promise<RuntimePayload> {
  const now = options.now ?? new Date();
  const minutes = options.windowMinutes ?? 30;
  const start = options.windowStart ?? windowStartFromEnv(now, minutes);
  let traces = options.traces;
  let queried = options.queried ?? traces !== undefined;
  if (options.queried === false) {
    traces = [];
    queried = false;
  } else if (traces === undefined) {
    const projectId =
      options.projectId ??
      process.env.TRACE_PROJECT ??
      process.env.GOOGLE_CLOUD_PROJECT;
    if (projectId === undefined || projectId.length === 0) {
      traces = [];
      queried = false;
    } else {
      const result = await queryCloudTraces({
        projectId,
        start,
        end: now,
      });
      traces = result.traces;
      queried = result.queried;
    }
  }
  const traffic = options.traffic ?? trafficFromEnv(queried);
  const allowed =
    options.services !== undefined && options.services.length > 0
      ? options.services
      : DEFAULT_SERVICES;
  const edges = edgesFromSpans(traces, allowed);
  const imports = importServiceEdges(options.modules, options.relativize);
  const vsImports = queried
    ? diffAgainstImports(edges, imports)
    : { runtimeOnly: [], importOnly: [] };
  return {
    callGraph: {
      ...emptyRuntimeCallGraph(now, queried, traffic),
      description: CALL_GRAPH_DESCRIPTION,
      window: { start: start.toISOString(), end: now.toISOString() },
      ...(queried ? { edges } : {}),
      queried,
    },
    vsImports,
    signals: ILLUSTRATIVE_RUNTIME_SIGNALS,
  };
}
