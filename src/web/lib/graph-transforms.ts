import type { RFNode, RFEdge } from "./types";

export const LINKAGE_COLOR = "#6366a1";
export const FQID_COLOR = "#4b7c6c";
export const EDGE_COLOR = "#10b981";

export function aggregateByNamespace(
  nodes: RFNode[],
  edges: RFEdge[],
): { nodes: RFNode[]; edges: RFEdge[] } {
  const getNs = (domainId: string): string => {
    const parts = (domainId || "").split(".");
    return parts.slice(0, 2).join(".") || domainId;
  };

  const nodeToNs = new Map<string, string>();
  const nsCount = new Map<string, number>();
  nodes.forEach((n) => {
    const ns = getNs(n.data.domainId);
    nodeToNs.set(n.id, ns);
    nsCount.set(ns, (nsCount.get(ns) || 0) + 1);
  });

  const newNodes: RFNode[] = Array.from(nsCount.entries()).map(
    ([ns, count]) => ({
      id: "ns_" + ns,
      type: "domainNode",
      data: {
        domainId: ns,
        label: ns,
        nodeType: "domain",
        isNamespace: true,
        childCount: count,
      },
      position: { x: 0, y: 0 },
    }),
  );

  const edgeAgg = new Map<
    string,
    {
      id: string;
      source: string;
      target: string;
      count: number;
      kinds: Set<string>;
    }
  >();

  edges.forEach((e) => {
    const fromNs = nodeToNs.get(e.source);
    const toNs = nodeToNs.get(e.target);
    if (!fromNs || !toNs || fromNs === toNs) return;

    const key = fromNs + "__" + toNs;
    if (!edgeAgg.has(key)) {
      edgeAgg.set(key, {
        id: "ns_edge_" + fromNs + "__" + toNs,
        source: "ns_" + fromNs,
        target: "ns_" + toNs,
        count: 0,
        kinds: new Set(),
      });
    }
    const a = edgeAgg.get(key)!;
    a.count++;
    if (e.data && e.data.kind) a.kinds.add(e.data.kind);
  });

  const newEdges: RFEdge[] = Array.from(edgeAgg.values()).map((a) => ({
    id: a.id,
    source: a.source,
    target: a.target,
    type: "smoothstep",
    label: String(a.count),
    data: {
      isAggregated: true,
      count: a.count,
      kinds: Array.from(a.kinds),
      kind: "aggregated",
    },
    markerEnd: {
      type: "arrowclosed",
      color: LINKAGE_COLOR,
      width: 14,
      height: 14,
    },
    style: {
      stroke: LINKAGE_COLOR,
      strokeWidth: Math.min(1 + a.count / 6, 4),
      opacity: 0.85,
    },
  }));

  // TODO: заменить на прямой импорт dagreLayout в компоненте — здесь возвращаем
  // неразложенные nodes, чтобы не тянуть dagre в этот модуль.
  return { nodes: newNodes, edges: newEdges };
}

export function mergeBidirectional(edges: RFEdge[]): RFEdge[] {
  const result: RFEdge[] = [];
  const seen = new Set<string>();
  const processed = new Set<string>();

  const pairMap = new Map<string, RFEdge[]>();
  edges.forEach((e) => {
    if (!e || !e.source || !e.target) return;
    const key = [e.source, e.target].sort().join("__");
    if (!pairMap.has(key)) pairMap.set(key, []);
    pairMap.get(key)!.push(e);
  });

  edges.forEach((e) => {
    if (processed.has(e.id)) return;

    const key = [e.source, e.target].sort().join("__");
    const group = pairMap.get(key) || [];
    let forward: RFEdge | null = null;
    let backward: RFEdge | null = null;

    for (const g of group) {
      if (processed.has(g.id)) continue;
      if (g.source === e.source && g.target === e.target && !forward)
        forward = g;
      else if (g.source === e.target && g.target === e.source && !backward)
        backward = g;
    }

    if (forward && backward) {
      const stableId = "bi__" + [forward.id, backward.id].sort().join("__");
      if (!seen.has(stableId)) {
        seen.add(stableId);
        result.push(
          Object.assign({}, forward, {
            id: stableId,
            source: forward.source,
            target: forward.target,
            markerStart: {
              type: "arrowclosed",
              color: forward.markerEnd
                ? forward.markerEnd.color
                : LINKAGE_COLOR,
              width: 12,
              height: 12,
            },
            data: Object.assign({}, forward.data, {
              isBidirectional: true,
              reverseEdgeId: backward.id,
              refCount:
                ((forward.data && forward.data.refCount) || 0) +
                ((backward.data && backward.data.refCount) || 0),
            }),
          }),
        );
      }
      processed.add(forward.id);
      processed.add(backward.id);
    } else {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        result.push(e);
      }
      processed.add(e.id);
    }
  });

  return result;
}
