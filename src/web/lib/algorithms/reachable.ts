import type { RFEdge } from "../types";

export function findReachable(
  startId: string,
  depth: number,
  edges: RFEdge[],
): Set<string> {
  const inAdj = new Map<string, string[]>();
  const outAdj = new Map<string, string[]>();

  edges.forEach((e) => {
    if (!outAdj.has(e.source)) outAdj.set(e.source, []);
    outAdj.get(e.source)!.push(e.target);
    if (!inAdj.has(e.target)) inAdj.set(e.target, []);
    inAdj.get(e.target)!.push(e.source);
  });

  const visited = new Set<string>([startId]);
  const queue: Array<{ id: string; d: number }> = [{ id: startId, d: 0 }];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.d >= depth) continue;
    const neighbors = (outAdj.get(cur.id) || []).concat(
      inAdj.get(cur.id) || [],
    );
    for (const n of neighbors) {
      if (visited.has(n)) continue;
      visited.add(n);
      queue.push({ id: n, d: cur.d + 1 });
    }
  }
  return visited;
}
