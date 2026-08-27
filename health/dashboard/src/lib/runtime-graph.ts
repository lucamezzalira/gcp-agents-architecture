export type RuntimeProtocol = "http" | "pubsub";

export type RuntimeEdgeView = {
  from: string;
  to: string;
  protocol: RuntimeProtocol;
  purpose: string;
  count?: number;
};

export const DESIGNED_RUNTIME_EDGES: RuntimeEdgeView[] = [
  {
    from: "checkout",
    to: "inventory",
    protocol: "pubsub",
    purpose: "reservations",
  },
  {
    from: "inventory",
    to: "checkout",
    protocol: "pubsub",
    purpose: "reservation outcomes",
  },
  {
    from: "checkout",
    to: "notification",
    protocol: "pubsub",
    purpose: "paid confirmation",
  },
  {
    from: "inventory",
    to: "notification",
    protocol: "pubsub",
    purpose: "low-stock alert",
  },
  {
    from: "checkout",
    to: "audit",
    protocol: "pubsub",
    purpose: "instruction tape",
  },
];

export type ObservedRuntimeEdge = {
  from: string;
  to: string;
  protocol: string;
  count?: number;
};

function protocolOf(value: string): RuntimeProtocol | undefined {
  if (value === "http" || value === "pubsub") {
    return value;
  }
  return undefined;
}

function edgeKey(from: string, to: string, protocol: string): string {
  return `${from}->${to}:${protocol}`;
}

export function mergeRuntimeEdges(
  observed: ObservedRuntimeEdge[],
): RuntimeEdgeView[] {
  const counts = new Map<string, number>();
  for (const edge of observed) {
    const protocol = protocolOf(edge.protocol);
    if (protocol === undefined) {
      continue;
    }
    const key = edgeKey(edge.from, edge.to, protocol);
    counts.set(key, (counts.get(key) ?? 0) + (edge.count ?? 0));
  }
  const merged = DESIGNED_RUNTIME_EDGES.map((edge) => {
    const count = counts.get(edgeKey(edge.from, edge.to, edge.protocol));
    if (count === undefined) {
      return edge;
    }
    return { ...edge, count };
  });
  for (const edge of observed) {
    const protocol = protocolOf(edge.protocol);
    if (protocol === undefined) {
      continue;
    }
    const key = edgeKey(edge.from, edge.to, protocol);
    if (
      DESIGNED_RUNTIME_EDGES.some(
        (item) => edgeKey(item.from, item.to, item.protocol) === key,
      )
    ) {
      continue;
    }
    merged.push({
      from: edge.from,
      to: edge.to,
      protocol,
      purpose: "observed",
      count: edge.count,
    });
  }
  return merged;
}

export type GraphNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GraphLink = {
  from: string;
  to: string;
  protocol: RuntimeProtocol;
  purpose: string;
  count?: number;
  d: string;
  labelX: number;
  labelY: number;
  label: string;
};

export type RuntimeGraphLayout = {
  width: number;
  height: number;
  nodes: GraphNode[];
  links: GraphLink[];
};

const NODE_W = 148;
const NODE_H = 44;
const WIDTH = 720;
const HEIGHT = 340;

const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  checkout: { x: 36, y: 132 },
  inventory: { x: 286, y: 132 },
  notification: { x: 536, y: 132 },
  audit: { x: 36, y: 248 },
};

type Lane = "skip-top" | "upper-far" | "upper-near" | "lower" | "drop";

const EDGE_LANES: Record<string, Lane> = {
  "checkout->notification:pubsub": "skip-top",
  "checkout->inventory:pubsub": "upper-far",
  "inventory->notification:pubsub": "upper-near",
  "inventory->checkout:pubsub": "lower",
  "checkout->audit:pubsub": "drop",
};

function box(id: string):
  | {
      left: number;
      right: number;
      top: number;
      bottom: number;
      cx: number;
      cy: number;
    }
  | undefined {
  const pos = NODE_POSITIONS[id];
  if (pos === undefined) {
    return undefined;
  }
  return {
    left: pos.x,
    right: pos.x + NODE_W,
    top: pos.y,
    bottom: pos.y + NODE_H,
    cx: pos.x + NODE_W / 2,
    cy: pos.y + NODE_H / 2,
  };
}

function curve(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  controlY: number,
): { d: string; labelX: number; labelY: number } {
  const labelX = (x1 + x2) / 2;
  return {
    d: `M ${x1} ${y1} Q ${labelX} ${controlY} ${x2} ${y2}`,
    labelX,
    labelY: controlY,
  };
}

function route(
  from: string,
  to: string,
  lane: Lane,
): { d: string; labelX: number; labelY: number } | undefined {
  const start = box(from);
  const end = box(to);
  if (start === undefined || end === undefined) {
    return undefined;
  }
  if (lane === "skip-top") {
    return curve(start.cx, start.top, end.cx, end.top, 28);
  }
  if (lane === "drop") {
    return curve(start.cx, start.bottom, end.cx, end.top, 212);
  }
  if (lane === "lower") {
    const goingRight = start.cx < end.cx;
    return curve(
      goingRight ? start.right : start.left,
      start.bottom,
      goingRight ? end.left : end.right,
      end.bottom,
      232,
    );
  }
  const goingRight = start.cx < end.cx;
  const controlY = lane === "upper-far" ? 58 : 96;
  return curve(
    goingRight ? start.right : start.left,
    start.top + 8,
    goingRight ? end.left : end.right,
    end.top + 8,
    controlY,
  );
}

function linkLabel(edge: RuntimeEdgeView): string {
  const count = edge.count !== undefined ? ` · ${edge.count}` : "";
  if (edge.protocol === "http") {
    return `HTTP ${edge.purpose}${count}`;
  }
  return edge.purpose + count;
}

export function layoutRuntimeGraph(edges: RuntimeEdgeView[]): RuntimeGraphLayout {
  const present = new Set<string>();
  for (const edge of edges) {
    present.add(edge.from);
    present.add(edge.to);
  }
  const nodes: GraphNode[] = Object.entries(NODE_POSITIONS)
    .filter(([id]) => present.has(id))
    .map(([id, pos]) => ({
      id,
      x: pos.x,
      y: pos.y,
      width: NODE_W,
      height: NODE_H,
    }));
  const used = new Set<string>();
  const links: GraphLink[] = [];
  for (const edge of edges) {
    const key = edgeKey(edge.from, edge.to, edge.protocol);
    const lane = EDGE_LANES[key] ?? (edge.from === edge.to ? "lower" : "upper-near");
    const placed = route(edge.from, edge.to, lane);
    if (placed === undefined) {
      continue;
    }
    used.add(key);
    links.push({
      from: edge.from,
      to: edge.to,
      protocol: edge.protocol,
      purpose: edge.purpose,
      count: edge.count,
      d: placed.d,
      labelX: placed.labelX,
      labelY: placed.labelY,
      label: linkLabel(edge),
    });
  }
  return { width: WIDTH, height: HEIGHT, nodes, links };
}
