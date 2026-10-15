import type { RFNode, RFEdge, DepGraph, TopoSortResult } from "../types";

export interface BuildDependencyGraphOptions {
  includeFqid?: boolean;
  includeLinkage?: boolean;
  missingAsSatisfied?: boolean;
  excludedIds?: Set<string>;
  restrictTo?: Set<string> | null;
}

export function buildDependencyGraph(
  nodes: RFNode[],
  edges: RFEdge[],
  options: BuildDependencyGraphOptions = {},
): DepGraph {
  const includeFqid = options.includeFqid !== false;
  const includeLinkage = options.includeLinkage !== false;
  const excludedIds = options.excludedIds || new Set<string>();
  const restrictTo = options.restrictTo || null;

  const nodeById = new Map<string, RFNode>();
  nodes.forEach((n) => nodeById.set(n.id, n));

  const deps = new Map<string, Set<string>>();
  const domainIds = new Set<string>();

  nodes.forEach((n) => {
    if (n.data.nodeType !== "domain") return;
    const did = n.data.domainId;
    if (excludedIds.has(did.toLowerCase())) return;
    if (restrictTo && !restrictTo.has(did)) return;
    domainIds.add(did);
    deps.set(did, new Set());
  });

  edges.forEach((e) => {
    const kind = e.data && e.data.kind;
    if (kind === "linkage" && !includeLinkage) return;
    if (kind === "fqid" && !includeFqid) return;
    if (kind === "aggregated") return;

    const srcNode = nodeById.get(e.source);
    const tgtNode = nodeById.get(e.target);
    if (!srcNode || !tgtNode) return;
    if (srcNode.data.nodeType !== "domain") return;

    const srcId = srcNode.data.domainId;
    if (!domainIds.has(srcId)) return;

    const tgtType = tgtNode.data.nodeType;
    if (tgtType === "broken" || tgtType === "missing") return;

    const tgtId = tgtNode.data.domainId;
    if (!domainIds.has(tgtId)) return;
    if (srcId === tgtId) return;

    deps.get(srcId)!.add(tgtId);
  });

  return { deps, domainIds, nodeById };
}

export interface TopologicalSortOptions {
  autoBreakCycles?: boolean;
}

export function topologicalSort(
  depGraph: DepGraph,
  options: TopologicalSortOptions = {},
): TopoSortResult {
  const autoBreak = !!options.autoBreakCycles;
  const deps = depGraph.deps;
  const remaining = new Set(depGraph.domainIds);
  const levels: string[][] = [];
  const broken: Array<{ id: string; level: number; brokenDeps: string[] }> = [];

  while (remaining.size > 0) {
    const ready: string[] = [];

    remaining.forEach((id) => {
      let ok = true;
      const set = deps.get(id);
      if (set) {
        set.forEach((dep) => {
          if (remaining.has(dep)) ok = false;
        });
      }
      if (ok) ready.push(id);
    });

    if (ready.length === 0) {
      if (!autoBreak) break;

      let best: string | null = null;
      let bestCount = Infinity;
      remaining.forEach((id) => {
        let cnt = 0;
        const s = deps.get(id);
        if (s)
          s.forEach((dep) => {
            if (remaining.has(dep)) cnt++;
          });
        if (cnt < bestCount) {
          bestCount = cnt;
          best = id;
        }
      });

      if (best == null) break;

      const brokenDeps: string[] = [];
      const s = deps.get(best!);
      if (s) {
        s.forEach((dep) => {
          if (remaining.has(dep)) brokenDeps.push(dep);
        });
        brokenDeps.forEach((dep) => s.delete(dep));
      }

      broken.push({ id: best!, level: levels.length + 1, brokenDeps });
      remaining.delete(best!);
      levels.push([best!]);
      continue;
    }

    ready.forEach((id) => remaining.delete(id));
    levels.push(ready.sort());
  }

  const cyclic = Array.from(remaining).sort();

  return {
    levels,
    cyclic,
    criticalPath: levels.length,
    broken,
  };
}

export function findDeps(
  domainId: string,
  levelMap: Map<string, number>,
  edges: RFEdge[],
  nodes: RFNode[],
): string[] {
  const nodeById = new Map<string, RFNode>();
  nodes.forEach((n) => nodeById.set(n.id, n));

  const set = new Set<string>();
  edges.forEach((e) => {
    const s = nodeById.get(e.source);
    if (!s || s.data.nodeType !== "domain") return;
    if (s.data.domainId !== domainId) return;

    const t = nodeById.get(e.target);
    if (!t || t.data.nodeType !== "domain") return;
    if (!levelMap.has(t.data.domainId)) return;

    set.add(t.data.domainId);
  });
  return Array.from(set).sort();
}
