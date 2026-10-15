import type { RFNode, RFEdge } from "./types";

export interface Snapshot {
  savedAt: string;
  server?: string | null;
  stats: { nodes: number; edges: number };
  nodes: Array<{ id: string; domainId: string; nodeType: string }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
    kind?: string;
    fullLabel?: string;
    refCount?: number;
  }>;
}

export interface DiffResult {
  addedNodes: Set<string>;
  removedNodes: Set<string>;
  addedEdges: Set<string>;
  removedEdges: Set<string>;
}

export function createSnapshot(
  nodes: RFNode[],
  edges: RFEdge[],
  server: string | null,
): Snapshot {
  return {
    savedAt: new Date().toISOString(),
    server,
    stats: { nodes: nodes.length, edges: edges.length },
    nodes: nodes.map((n) => ({
      id: n.id,
      domainId: n.data.domainId,
      nodeType: n.data.nodeType,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      kind: e.data && e.data.kind,
      fullLabel: e.data && e.data.fullLabel,
      refCount: e.data && e.data.refCount,
    })),
  };
}

export function computeDiff(
  nodes: RFNode[],
  edges: RFEdge[],
  snap: Snapshot,
): DiffResult | null {
  if (!snap || !Array.isArray(snap.nodes) || !Array.isArray(snap.edges))
    return null;

  const snapEdgeIds = new Set(snap.edges.map((x) => x.id));
  const snapNodeIds = new Set(snap.nodes.map((x) => x.id));
  const curEdgeIds = new Set(edges.map((x) => x.id));
  const curNodeIds = new Set(nodes.map((x) => x.id));

  const addedEdges = new Set<string>();
  const removedEdges = new Set<string>();
  const addedNodes = new Set<string>();
  const removedNodes = new Set<string>();

  curEdgeIds.forEach((id) => {
    if (!snapEdgeIds.has(id)) addedEdges.add(id);
  });
  snapEdgeIds.forEach((id) => {
    if (!curEdgeIds.has(id)) removedEdges.add(id);
  });
  curNodeIds.forEach((id) => {
    if (!snapNodeIds.has(id)) addedNodes.add(id);
  });
  snapNodeIds.forEach((id) => {
    if (!curNodeIds.has(id)) removedNodes.add(id);
  });

  return { addedNodes, removedNodes, addedEdges, removedEdges };
}
