import type { RFNode, RFEdge, CycleInfo } from "../types";

export function findCycles(nodes: RFNode[], edges: RFEdge[]): CycleInfo {
  const adjacency = new Map<string, string[]>();
  nodes.forEach((n) => adjacency.set(n.id, []));
  edges.forEach((e) => {
    if (adjacency.has(e.source)) adjacency.get(e.source)!.push(e.target);
  });

  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const sccs: string[][] = [];

  function strongconnect(v: string): void {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    const neighbors = adjacency.get(v) || [];
    for (const to of neighbors) {
      if (!adjacency.has(to)) continue;
      if (!indices.has(to)) {
        strongconnect(to);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(to)!));
      } else if (onStack.has(to)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(to)!));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1) sccs.push(scc);
    }
  }

  for (const n of nodes) {
    if (!indices.has(n.id)) strongconnect(n.id);
  }

  const nodeToScc = new Map<string, number>();
  sccs.forEach((scc, i) => {
    scc.forEach((n) => nodeToScc.set(n, i));
  });

  const cycleNodes = new Set<string>();
  sccs.forEach((scc) => scc.forEach((n) => cycleNodes.add(n)));

  const cycleEdges = new Set<string>();
  edges.forEach((e) => {
    const s = nodeToScc.get(e.source);
    const t = nodeToScc.get(e.target);
    if (s !== undefined && s === t) cycleEdges.add(e.id);
  });

  return { sccs, cycleNodes, cycleEdges };
}
