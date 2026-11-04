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

// ============ SCC: разбивка циклических доменов на группы ============

/**
 * Tarjan SCC по графу зависимостей (deps: A → {B, C} = «A зависит от B, C»).
 * Возвращает только циклы (SCC размера > 1) + self-loops.
 *
 * Используется для группировки cyclic[] в понятные «циклы»,
 * а не плоский список.
 */
export function detectDependencyCycles(
  deps: Map<string, Set<string>>,
  onlyFrom?: Set<string>,
): string[][] {
  const nodes = new Set<string>();
  deps.forEach((set, src) => {
    if (onlyFrom && !onlyFrom.has(src)) {
      // Узел не в области — но его deps ещё могут участвовать
    }
    nodes.add(src);
    set.forEach((d) => nodes.add(d));
  });
  if (onlyFrom) {
    for (const n of Array.from(nodes)) {
      if (!onlyFrom.has(n)) nodes.delete(n);
    }
  }

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

    const neighbors = Array.from(deps.get(v) || []).filter((n) =>
      nodes.has(n),
    );
    for (const w of neighbors) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
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
      if (scc.length > 1) {
        sccs.push(scc);
      } else {
        // self-loop: A зависит от A
        const only = scc[0];
        if (deps.get(only)?.has(only)) sccs.push([only]);
      }
    }
  }

  for (const n of nodes) {
    if (!indices.has(n)) strongconnect(n);
  }

  // Сортировка: сначала крупные циклы, потом по имени
  sccs.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return a[0].localeCompare(b[0]);
  });

  return sccs;
}

/**
 * Все транзитивные зависимости домена до заданной глубины.
 * BFS по deps. Возвращает Map<fqid, distance>.
 */
export function transitiveDeps(
  start: string,
  deps: Map<string, Set<string>>,
  maxDepth = 5,
): Map<string, number> {
  const result = new Map<string, number>();
  const queue: Array<{ id: string; d: number }> = [{ id: start, d: 0 }];
  const visited = new Set<string>([start]);

  while (queue.length > 0) {
    const { id, d } = queue.shift()!;
    if (d >= maxDepth) continue;
    const next = deps.get(id);
    if (!next) continue;
    for (const dep of next) {
      if (visited.has(dep)) continue;
      visited.add(dep);
      result.set(dep, d + 1);
      queue.push({ id: dep, d: d + 1 });
    }
  }

  return result;
}

/**
 * Обратный индекс: кто зависит от X.
 */
export function reverseDeps(
  deps: Map<string, Set<string>>,
): Map<string, Set<string>> {
  const rev = new Map<string, Set<string>>();
  deps.forEach((set, src) => {
    set.forEach((dst) => {
      if (!rev.has(dst)) rev.set(dst, new Set());
      rev.get(dst)!.add(src);
    });
  });
  return rev;
}