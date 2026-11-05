import type { EntityRecord, ModelIndex } from "../../../shared/model-types";

export type EntityEdgeKind = "inheritance" | "reference" | "linkage";
export type EntityKind = "regular" | "abstract" | "static";

export interface EntityGraphNode {
  id: string;
  entity: EntityRecord;
  domainId: string;
  entityId: string;
  label: string;
  /** Степень связности в текущем графе (in + out). */
  degree: number;
  /** Входит в топ-5 по degree (и degree >= 3). */
  isHub: boolean;
  /** degree === 0 в текущем графе. */
  isOrphan: boolean;
}

export interface EntityGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EntityEdgeKind;
  label?: string;
  viaAttribute?: string;
  linkageId?: string;
  title?: string;
  undirected?: boolean;
}

export interface EntityGraphResult {
  nodes: EntityGraphNode[];
  edges: EntityGraphEdge[];
  stats: {
    totalNodes: number;
    byKind: Record<EntityEdgeKind, number>;
    byEntityKind: Record<EntityKind, number>;
    truncated: number;
    orphans: number;
    hubs: number;
    focused: string | null;
  };
}

export interface EntityGraphOptions {
  /** Ограничить доменами (lowercase). Пусто — все. */
  domains?: Set<string>;
  showInheritance?: boolean;
  showReferences?: boolean;
  showLinkages?: boolean;
  limit?: number;
  /** Фильтр по kind сущности. Пусто — все. */
  kinds?: Set<EntityKind>;
  /** Скрыть узлы с degree === 0. */
  hideOrphans?: boolean;
  /** BFS-фокус: оставить только сущности на расстоянии <= focusDepth. */
  focusFqid?: string;
  focusDepth?: number;
}

// ============ helpers ============

function normalizeFqid(
  raw: string | null | undefined,
  domain: string,
): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.includes("/")
    ? s.toLowerCase()
    : `${domain.toLowerCase()}/${s.toLowerCase()}`;
}

export function shortEntityId(fqid: string): string {
  const slash = fqid.indexOf("/");
  return slash > 0 ? fqid.slice(slash + 1) : fqid;
}

// ============ Main ============

export function buildEntityGraph(
  index: ModelIndex,
  options: EntityGraphOptions = {},
): EntityGraphResult {
  const limit = options.limit ?? 200;
  const showInheritance = options.showInheritance !== false;
  const showReferences = options.showReferences !== false;
  const showLinkages = options.showLinkages !== false;
  const hideOrphans = options.hideOrphans === true;
  const focusFqid = options.focusFqid?.toLowerCase() || null;
  const focusDepth = options.focusDepth ?? 2;
  const domainFilter = options.domains;
  const kindsFilter = options.kinds;

  // ---- 1. Кандидаты ----
  let candidates = index.entities;
  if (domainFilter && domainFilter.size > 0) {
    candidates = candidates.filter((e) =>
      domainFilter.has(e.domainId.toLowerCase()),
    );
  }
  if (kindsFilter && kindsFilter.size > 0) {
    candidates = candidates.filter((e) =>
      kindsFilter.has((e.kind as EntityKind) || "regular"),
    );
  }

  // ---- 2. Сырые degrees (для сортировки) ----
  const degreeMap = new Map<string, number>();
  candidates.forEach((e) => degreeMap.set(e.fqid, 0));
  const bump = (fqid: string) => {
    if (degreeMap.has(fqid)) degreeMap.set(fqid, degreeMap.get(fqid)! + 1);
  };

  candidates.forEach((e) => {
    if (showInheritance && e.inherits) {
      bump(e.fqid);
      bump(e.inherits);
    }
    if (showReferences) {
      for (const a of e.attributes) {
        const t = a.referenceEntity || a.itemReferenceEntity;
        if (t) {
          bump(e.fqid);
          bump(t);
        }
      }
    }
  });
  if (showLinkages) {
    for (const l of index.entityLinkages) {
      bump(l.side1Fqid);
      bump(l.side2Fqid);
    }
  }

  // ---- 3. Сортировка + top-N ----
  const sorted = candidates.slice().sort((a, b) => {
    const da = degreeMap.get(a.fqid) || 0;
    const db = degreeMap.get(b.fqid) || 0;
    if (da !== db) return db - da;
    return a.fqid.localeCompare(b.fqid);
  });
  const selected = sorted.slice(0, limit);
  const selectedSet = new Set(selected.map((e) => e.fqid));

  // ---- 4. Рёбра ----
  const edges: EntityGraphEdge[] = [];
  const addedEdges = new Set<string>();
  const addEdge = (e: EntityGraphEdge) => {
    if (addedEdges.has(e.id)) return;
    if (e.source === e.target) return;
    addedEdges.add(e.id);
    edges.push(e);
  };

  if (showInheritance) {
    selected.forEach((e) => {
      if (!e.inherits || !selectedSet.has(e.inherits)) return;
      addEdge({
        id: `inh:${e.inherits}→${e.fqid}`,
        source: e.inherits,
        target: e.fqid,
        kind: "inheritance",
        label: "inherits",
        title: `${e.entityId} наследуется от ${shortEntityId(e.inherits)}`,
      });
    });
  }

  if (showReferences) {
    selected.forEach((e) => {
      for (const a of e.attributes) {
        const t = a.referenceEntity || a.itemReferenceEntity;
        if (!t || !selectedSet.has(t)) continue;
        const isArray = !!a.itemReferenceEntity;
        addEdge({
          id: `ref:${e.fqid}#${a.id}→${t}`,
          source: e.fqid,
          target: t,
          kind: "reference",
          label: a.name || a.id,
          viaAttribute: a.id,
          title:
            `${e.entityId}.${a.id} → ${shortEntityId(t)}\n` +
            `${isArray ? "Array<" : ""}${a.dataType}${isArray ? ">" : ""}`,
        });
      }
    });
  }

  if (showLinkages) {
    for (const l of index.entityLinkages) {
      if (!selectedSet.has(l.side1Fqid) || !selectedSet.has(l.side2Fqid))
        continue;
      const arrow = l.symmetric ? "↔" : l.undirected ? "—" : "→";
      addEdge({
        id: `lnk:${l.domainId}#${l.id}`,
        source: l.side1Fqid,
        target: l.side2Fqid,
        kind: "linkage",
        label: l.name,
        linkageId: l.id,
        undirected: l.undirected === true,
        title:
          `${l.name}\n` +
          `Тип: ${l.type}${l.symmetric ? " (симм.)" : l.undirected ? " (ненапр.)" : ""}\n` +
          `${shortEntityId(l.side1Fqid)} ${arrow} ${shortEntityId(l.side2Fqid)}`,
      });
    }
  }

  // ---- 5. Hide orphans ----
  let keptFqids = new Set(selected.map((e) => e.fqid));
  if (hideOrphans) {
    const connected = new Set<string>();
    for (const e of edges) {
      connected.add(e.source);
      connected.add(e.target);
    }
    keptFqids = new Set(Array.from(keptFqids).filter((f) => connected.has(f)));
  }

  // ---- 6. Focus BFS ----
  let effectiveFocus: string | null = null;
  if (focusFqid && keptFqids.has(focusFqid)) {
    effectiveFocus = focusFqid;
    const adj = new Map<string, Set<string>>();
    keptFqids.forEach((f) => adj.set(f, new Set()));
    for (const e of edges) {
      if (keptFqids.has(e.source) && keptFqids.has(e.target)) {
        adj.get(e.source)!.add(e.target);
        adj.get(e.target)!.add(e.source);
      }
    }
    const reachable = new Set<string>([focusFqid]);
    const queue: Array<{ fqid: string; d: number }> = [
      { fqid: focusFqid, d: 0 },
    ];
    while (queue.length > 0) {
      const { fqid, d } = queue.shift()!;
      if (d >= focusDepth) continue;
      for (const n of adj.get(fqid) || []) {
        if (!reachable.has(n)) {
          reachable.add(n);
          queue.push({ fqid: n, d: d + 1 });
        }
      }
    }
    keptFqids = reachable;
  }

  // ---- 7. Финал ----
  const finalEdges = edges.filter(
    (e) => keptFqids.has(e.source) && keptFqids.has(e.target),
  );
  const finalCandidates = selected.filter((e) => keptFqids.has(e.fqid));

  // ---- 8. Degree в финальном графе ----
  const finalDegree = new Map<string, number>();
  finalCandidates.forEach((e) => finalDegree.set(e.fqid, 0));
  for (const e of finalEdges) {
    finalDegree.set(e.source, (finalDegree.get(e.source) || 0) + 1);
    finalDegree.set(e.target, (finalDegree.get(e.target) || 0) + 1);
  }

  // ---- 9. Hub threshold: топ-5, degree >= 3 ----
  const degrees = Array.from(finalDegree.values()).sort((a, b) => b - a);
  const hubThreshold = Math.max(3, degrees[4] || 0);

  const nodes: EntityGraphNode[] = finalCandidates.map((e) => {
    const degree = finalDegree.get(e.fqid) || 0;
    return {
      id: e.fqid,
      entity: e,
      domainId: e.domainId,
      entityId: e.entityId,
      label: e.name || e.entityId,
      degree,
      isHub: degree >= hubThreshold && degree > 0,
      isOrphan: degree === 0,
    };
  });

  // ---- 10. Stats ----
  const byKind: Record<EntityEdgeKind, number> = {
    inheritance: 0,
    reference: 0,
    linkage: 0,
  };
  finalEdges.forEach((e) => byKind[e.kind]++);

  const byEntityKind: Record<EntityKind, number> = {
    regular: 0,
    abstract: 0,
    static: 0,
  };
  nodes.forEach((n) => {
    const k = (n.entity.kind as EntityKind) || "regular";
    byEntityKind[k]++;
  });

  return {
    nodes,
    edges: finalEdges,
    stats: {
      totalNodes: nodes.length,
      byKind,
      byEntityKind,
      truncated: Math.max(0, candidates.length - nodes.length),
      orphans: nodes.filter((n) => n.isOrphan).length,
      hubs: nodes.filter((n) => n.isHub).length,
      focused: effectiveFocus,
    },
  };
}

// ============ Path finder ============

export interface EntityPath {
  nodes: string[];
  edges: string[];
}

export function findEntityPath(
  graph: EntityGraphResult,
  fromFqid: string,
  toFqid: string,
): EntityPath | null {
  if (!fromFqid || !toFqid || fromFqid === toFqid) return null;

  const adj = new Map<string, Array<{ node: string; edge: string }>>();
  for (const e of graph.edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push({ node: e.target, edge: e.id });
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.target)!.push({ node: e.source, edge: e.id });
  }

  const visited = new Set<string>([fromFqid]);
  const queue: Array<{ id: string; path: string[]; edges: string[] }> = [
    { id: fromFqid, path: [fromFqid], edges: [] },
  ];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.id === toFqid) return { nodes: cur.path, edges: cur.edges };
    for (const n of adj.get(cur.id) || []) {
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
