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
    protocol: "http",
    purpose: "stock lookup",
  },
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
    purpose: "send-instruction (paid)",
  },
  {
    from: "inventory",
    to: "notification",
    protocol: "pubsub",
    purpose: "send-instruction (low stock)",
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
    if (DESIGNED_RUNTIME_EDGES.some((item) => edgeKey(item.from, item.to, item.protocol) === key)) {
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
};

export type RuntimeGraphLayout = {
  width: number;
  height: number;
  nodes: GraphNode[];
  links: GraphLink[];
};

const NODE_W = 148;
const NODE_H = 46;

const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  checkout: { x: 28, y: 88 },
  inventory: { x: 276, y: 88 },
  notification: { x: 524, y: 88 },
};

function nodeCenter(id: string): { x: number; y: number } | undefined {
  const pos = NODE_POSITIONS[id];
  if (pos === undefined) {
    return undefined;
  }
  return { x: pos.x + NODE_W / 2, y: pos.y + NODE_H / 2 };
}

export function layoutRuntimeGraph(edges: RuntimeEdgeView[]): RuntimeGraphLayout {
  const nodes: GraphNode[] = Object.entries(NODE_POSITIONS).map(([id, pos]) => ({
    id,
    x: pos.x,
    y: pos.y,
    width: NODE_W,
    height: NODE_H,
  }));
  const pairIndex = new Map<string, number>();
  const links: GraphLink[] = [];
  for (const edge of edges) {
    const start = nodeCenter(edge.from);
    const end = nodeCenter(edge.to);
    if (start === undefined || end === undefined) {
      continue;
    }
    const pair = `${edge.from}->${edge.to}`;
    const index = pairIndex.get(pair) ?? 0;
    pairIndex.set(pair, index + 1);
    const goingRight = end.x >= start.x;
    const lift = goingRight ? -(48 + index * 28) : 48 + index * 28;
    const midX = (start.x + end.x) / 2;
    const midY = start.y + lift;
    const d = `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
    links.push({
      from: edge.from,
      to: edge.to,
      protocol: edge.protocol,
      purpose: edge.purpose,
      count: edge.count,
      d,
      labelX: midX,
      labelY: midY + (goingRight ? -6 : 14),
    });
  }
  return { width: 700, height: 220, nodes, links };
}
