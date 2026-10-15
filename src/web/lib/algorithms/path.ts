import type { RFEdge } from "../types";

export interface PathResult {
  nodes: string[];
  edges: string[];
}

export function findPath(
  startId: string,
  endId: string,
  edges: RFEdge[],
): PathResult | null {
  if (!startId || !endId || startId === endId) return null;

  const adjacency = new Map<string, Array<{ node: string; edge: string }>>();
  edges.forEach((e) => {
    if (!adjacency.has(e.source)) adjacency.set(e.source, []);
    adjacency.get(e.source)!.push({ node: e.target, edge: e.id });
  });

  const visited = new Set<string>([startId]);
  const queue: Array<{ id: string; path: string[]; edges: string[] }> = [
    { id: startId, path: [startId], edges: [] },
  ];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.id === endId) return { nodes: cur.path, edges: cur.edges };

    const neighbors = adjacency.get(cur.id) || [];
    for (const n of neighbors) {
      if (visited.has(n.node)) continue;
      visited.add(n.node);
      queue.push({
        id: n.node,
        path: cur.path.concat([n.node]),
        edges: cur.edges.concat([n.edge]),
      });
    }
  }
  return null;
}
