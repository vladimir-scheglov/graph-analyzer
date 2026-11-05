import type {
  ModelIndex,
  DomainSchemaAllViewItem,
} from "../../../shared/model-types";

// ============ Types ============

export type ViewEdgeKind =
  | "action"
  | "tabs"
  | "nested"
  | "menu"
  | "dashboard"
  | "mixin";

export type ViewNodeKind =
  | "entity"
  | "list"
  | "panel"
  | "modal"
  | "page"
  | "tabs_list"
  | "dashboard"
  | "dashboard_tree"
  | "menu"
  | "menuItem"
  | "unknown";

export interface ViewGraphNode {
  id: string;
  viewId: string;
  domainId: string;
  kind: ViewNodeKind;
  entity: string | null;
  label: string | null;
  isMixin: boolean;
  isOrphan: boolean;
  unresolved: boolean;
  /** degree в итоговом графе. */
  degree: number;
  inDegree: number;
  outDegree: number;
  /** Входит в топ-5 по degree и degree >= 2. */
  isHub: boolean;
}

export interface ViewGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: ViewEdgeKind;
  label?: string;
  /** Для тултипа — доп. инфа. */
  detail?: string;
  isCrossDomain: boolean;
}

export interface ViewGraphResult {
  nodes: ViewGraphNode[];
  edges: ViewGraphEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    byEdgeKind: Record<ViewEdgeKind, number>;
    byNodeKind: Record<ViewNodeKind, number>;
    orphans: number;
    unresolved: number;
    hubs: number;
    crossDomainEdges: number;
    focusedId: string | null;
    truncated: number;
  };
}

export interface ViewGraphOptions {
  domains?: Set<string>;
  includeNested?: boolean;
  includeMixins?: boolean;
  includeDashboards?: boolean;
  includeMenus?: boolean;
  showEdgeKinds?: Set<ViewEdgeKind>;
  showNodeKinds?: Set<ViewNodeKind>;
  focusId?: string;
  focusDepth?: number;
  hideOrphans?: boolean;
  crossDomainOnly?: boolean;
  limit?: number;
}

// ============ Path finder ============

export interface ViewGraphPath {
  nodes: string[];
  edges: string[];
}

export function findViewPath(
  graph: ViewGraphResult,
  fromId: string,
  toId: string,
): ViewGraphPath | null {
  if (!fromId || !toId || fromId === toId) return null;
  const adj = new Map<string, Array<{ node: string; edge: string }>>();
  for (const e of graph.edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push({ node: e.target, edge: e.id });
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.target)!.push({ node: e.source, edge: e.id });
  }
  const visited = new Set<string>([fromId]);
  const queue: Array<{ id: string; path: string[]; edges: string[] }> = [
    { id: fromId, path: [fromId], edges: [] },
  ];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.id === toId) return { nodes: cur.path, edges: cur.edges };
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

// ============ Helpers ============

function shortEntity(fqid: string | null | undefined): string {
  if (!fqid) return "";
  const slash = fqid.indexOf("/");
  return slash > 0 ? fqid.slice(slash + 1) : fqid;
}

function normalizeEntity(
  raw: string | null | undefined,
  domainId: string,
): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.includes("/")
    ? s.toLowerCase()
    : `${domainId.toLowerCase()}/${s.toLowerCase()}`;
}

function qid(domainId: string, viewId: string): string {
  return `${domainId.toLowerCase()}/${viewId}`;
}

function isViewKind(k: string): k is ViewNodeKind {
  return (
    k === "entity" ||
    k === "list" ||
    k === "panel" ||
    k === "modal" ||
    k === "page" ||
    k === "tabs_list" ||
    k === "dashboard" ||
    k === "dashboard_tree"
  );
}

// ============ Build ============

export function buildViewGraph(
  index: ModelIndex,
  options: ViewGraphOptions = {},
): ViewGraphResult {
  const includeNested = options.includeNested !== false;
  const includeMixins = options.includeMixins !== false;
  const includeDashboards = options.includeDashboards !== false;
  const includeMenus = options.includeMenus !== false;
  const hideOrphans = options.hideOrphans === true;
  const crossDomainOnly = options.crossDomainOnly === true;
  const focusId = options.focusId?.toLowerCase() || null;
  const focusDepth = options.focusDepth ?? 2;
  const limit = options.limit ?? 500;
  const domainFilter = options.domains;

  // ---- 1. Собираем все views ----
  interface ViewMeta {
    domainId: string;
    view: DomainSchemaAllViewItem;
    isMixin: boolean;
  }
  const allViews: ViewMeta[] = [];

  for (const [domainId, schema] of Object.entries(
    index.schemasByDomain || {},
  )) {
    if (
      domainFilter &&
      domainFilter.size > 0 &&
      !domainFilter.has(domainId.toLowerCase())
    ) {
      continue;
    }
    const seen = new Set<string>();
    for (const v of schema.sections.views.items) {
      if (!v.id || seen.has(v.id)) continue;
      seen.add(v.id);
      allViews.push({
        domainId,
        view: v as DomainSchemaAllViewItem,
        isMixin: !!(v as any).isMixin,
      });
    }
    for (const v of schema.allViews || []) {
      if (!v.id || seen.has(v.id)) continue;
      seen.add(v.id);
      allViews.push({ domainId, view: v, isMixin: false });
    }
  }

  // ---- 2. Узлы views ----
  const nodes = new Map<string, ViewGraphNode>();

  for (const { domainId, view, isMixin } of allViews) {
    const id = qid(domainId, view.id);
    const kind: ViewNodeKind = isViewKind(view.type)
      ? (view.type as ViewNodeKind)
      : "unknown";
    const entity = normalizeEntity(view.entity, domainId);
    const unresolved = !!entity && !index.entitiesByFqid[entity];
    nodes.set(id, {
      id,
      viewId: view.id,
      domainId,
      kind,
      entity,
      label: view.label || null,
      isMixin,
      isOrphan: false,
      unresolved,
      degree: 0,
      inDegree: 0,
      outDegree: 0,
      isHub: false,
    });
  }

  // ---- 3. Узлы menu / menuItem ----
  const menuNodesById = new Map<string, ViewGraphNode>();
  if (includeMenus) {
    for (const menu of index.menus || []) {
      if (
        domainFilter &&
        domainFilter.size > 0 &&
        !domainFilter.has(menu.domainId.toLowerCase())
      ) {
        continue;
      }
      const id = qid(menu.domainId, `menu:${menu.id}`);
      const node: ViewGraphNode = {
        id,
        viewId: `menu:${menu.id}`,
        domainId: menu.domainId,
        kind: "menu",
        entity: null,
        label: menu.label || menu.id,
        isMixin: false,
        isOrphan: false,
        unresolved: false,
        degree: 0,
        inDegree: 0,
        outDegree: 0,
        isHub: false,
      };
      menuNodesById.set(id, node);
      nodes.set(id, node);

      for (const it of menu.items || []) {
        const itemId = qid(menu.domainId, `menuItem:${it.id}`);
        const itemNode: ViewGraphNode = {
          id: itemId,
          viewId: `menuItem:${it.id}`,
          domainId: menu.domainId,
          kind: "menuItem",
          entity: null,
          label: it.label || it.id,
          isMixin: false,
          isOrphan: false,
          unresolved: false,
          degree: 0,
          inDegree: 0,
          outDegree: 0,
          isHub: false,
        };
        menuNodesById.set(itemId, itemNode);
        nodes.set(itemId, itemNode);
      }
    }
  }

  // ---- 4. Рёбра ----
  const edges: ViewGraphEdge[] = [];
  const edgeIds = new Set<string>();

  const addEdge = (e: Omit<ViewGraphEdge, "isCrossDomain">) => {
    if (e.source === e.target) return;
    if (edgeIds.has(e.id)) return;
    if (!nodes.has(e.source) || !nodes.has(e.target)) return;
    const srcDomain = nodes.get(e.source)!.domainId.toLowerCase();
    const tgtDomain = nodes.get(e.target)!.domainId.toLowerCase();
    const isCrossDomain = srcDomain !== tgtDomain;
    if (crossDomainOnly && !isCrossDomain) return;
    edgeIds.add(e.id);
    edges.push({ ...e, isCrossDomain });
  };

  // ---- 4a. Actions → views ----
  for (const a of index.actions || []) {
    if (
      domainFilter &&
      domainFilter.size > 0 &&
      !domainFilter.has(a.domainId.toLowerCase())
    )
      continue;
    const refs: Array<{ field: string; value?: string }> = [
      { field: "modal", value: a.modal },
      { field: "panel", value: a.panel },
      { field: "view", value: a.view },
      { field: "pageView", value: a.pageView },
    ];
    const ownerViews = findActionOwnerViews(a.id, a.domainId, index);
    for (const r of refs) {
      if (!r.value) continue;
      const targetDomain = r.value.includes("/")
        ? r.value.split("/")[0]
        : a.domainId;
      const targetId = r.value.includes("/") ? r.value.split("/")[1] : r.value;
      const target = qid(targetDomain, targetId);
      if (!nodes.has(target)) continue;
      for (const owner of ownerViews) {
        if (!nodes.has(owner)) continue;
        addEdge({
          id: `action:${owner}:${target}:${a.id}`,
          source: owner,
          target,
          kind: "action",
          label: a.id,
          detail: `type: ${a.type}${r.field !== "modal" ? ` (${r.field})` : ""}`,
        });
      }
    }
  }

  // ---- 4b. tabs_list ----
  for (const { domainId, view } of allViews) {
    if (view.type !== "tabs_list" || !view.tabs) continue;
    const src = qid(domainId, view.id);
    for (const t of view.tabs) {
      const tDomain = t.includes("/") ? t.split("/")[0] : domainId;
      const tId = t.includes("/") ? t.split("/")[1] : t;
      const target = qid(tDomain, tId);
      addEdge({
        id: `tabs:${src}:${target}`,
        source: src,
        target,
        kind: "tabs",
      });
    }
  }

  // ---- 4c. nested views ----
  if (includeNested) {
    for (const { domainId, view } of allViews) {
      if (!view.parentViewId) continue;
      const parent = qid(domainId, view.parentViewId);
      const child = qid(domainId, view.id);
      addEdge({
        id: `nested:${parent}:${child}`,
        source: parent,
        target: child,
        kind: "nested",
        detail: view.type,
      });
    }
  }

  // ---- 4d. menus → views ----
  if (includeMenus) {
    for (const menu of index.menus || []) {
      if (
        domainFilter &&
        domainFilter.size > 0 &&
        !domainFilter.has(menu.domainId.toLowerCase())
      )
        continue;
      const menuId = qid(menu.domainId, `menu:${menu.id}`);

      // root_menu.view (для type: root_menu)
      if (menu.type === "root_menu" && menu.view) {
        const tDom = menu.view.includes("/")
          ? menu.view.split("/")[0]
          : menu.domainId;
        const tId = menu.view.includes("/")
          ? menu.view.split("/")[1]
          : menu.view;
        addEdge({
          id: `menu:${menuId}:${qid(tDom, tId)}`,
          source: menuId,
          target: qid(tDom, tId),
          kind: "menu",
          label: menu.label,
        });
      }

      // items[] → view + menu → menuItem
      for (const it of menu.items || []) {
        const itemId = qid(menu.domainId, `menuItem:${it.id}`);
        addEdge({
          id: `menu-parent:${menuId}:${itemId}`,
          source: menuId,
          target: itemId,
          kind: "menu",
          detail: "menu → item",
        });
        if (it.view) {
          const tDom = it.view.includes("/")
            ? it.view.split("/")[0]
            : menu.domainId;
          const tId = it.view.includes("/") ? it.view.split("/")[1] : it.view;
          addEdge({
            id: `menuItem:${itemId}:${qid(tDom, tId)}`,
            source: itemId,
            target: qid(tDom, tId),
            kind: "menu",
            label: it.label || it.id,
          });
        }
      }
    }
  }

  // ---- 4e. dashboard_tree ----
  if (includeDashboards) {
    for (const [domainId, schema] of Object.entries(
      index.schemasByDomain || {},
    )) {
      if (
        domainFilter &&
        domainFilter.size > 0 &&
        !domainFilter.has(domainId.toLowerCase())
      )
        continue;
      const items = schema.sections.views.items || [];
      for (const v of items) {
        if (v.type !== "dashboard_tree") continue;
        const treeViews = v.dashboardTreeViews;
        if (!Array.isArray(treeViews) || treeViews.length === 0) continue;
        const src = qid(domainId, v.id);
        if (!nodes.has(src)) continue;
        for (const vId of treeViews) {
          const target = qid(domainId, vId);
          addEdge({
            id: `dash:${src}:${target}`,
            source: src,
            target,
            kind: "dashboard",
          });
        }
      }
    }
  }

  // ---- 4f. mixins ----
  if (includeMixins) {
    for (const m of index.mixins || []) {
      if (
        domainFilter &&
        domainFilter.size > 0 &&
        !domainFilter.has(m.domainId.toLowerCase())
      )
        continue;
      const targetFqid = m.targetEntityFqid.toLowerCase();
      const targetEntityViews: string[] = [];
      for (const { domainId, view } of allViews) {
        if (view.type !== "entity") continue;
        if (normalizeEntity(view.entity, domainId) !== targetFqid) continue;
        targetEntityViews.push(qid(domainId, view.id));
      }
      const sourceEntityViews: string[] = [];
      for (const { domainId, view } of allViews) {
        if (view.type !== "entity") continue;
        if (domainId.toLowerCase() !== m.domainId.toLowerCase()) continue;
        sourceEntityViews.push(qid(domainId, view.id));
      }
      for (const src of sourceEntityViews) {
        for (const tgt of targetEntityViews) {
          addEdge({
            id: `mixin:${src}:${tgt}:${m.id}`,
            source: src,
            target: tgt,
            kind: "mixin",
            label: m.id,
            detail: `mixin ${m.type}`,
          });
        }
      }
    }
  }

  // ---- 5. Фильтр по edge kinds ----
  let workingEdges = edges;
  if (options.showEdgeKinds && options.showEdgeKinds.size > 0) {
    workingEdges = edges.filter((e) => options.showEdgeKinds!.has(e.kind));
  }

  // ---- 6. Фильтр по node kinds ----
  let workingNodes = Array.from(nodes.values());
  if (options.showNodeKinds && options.showNodeKinds.size > 0) {
    const allowed = options.showNodeKinds;
    // menu/menuItem всегда оставляем, если includeMenus — они нужны для связей
    workingNodes = workingNodes.filter(
      (n) =>
        allowed.has(n.kind) ||
        (includeMenus && (n.kind === "menu" || n.kind === "menuItem")),
    );
  }

  // ---- 7. Hide orphans ----
  let keptIds = new Set(workingNodes.map((n) => n.id));
  if (hideOrphans) {
    const connected = new Set<string>();
    for (const e of workingEdges) {
      connected.add(e.source);
      connected.add(e.target);
    }
    keptIds = new Set(Array.from(keptIds).filter((id) => connected.has(id)));
  }

  // ---- 8. Focus BFS ----
  let effectiveFocus: string | null = null;
  if (focusId && keptIds.has(focusId)) {
    effectiveFocus = focusId;
    const adj = new Map<string, Set<string>>();
    keptIds.forEach((id) => adj.set(id, new Set()));
    for (const e of workingEdges) {
      if (keptIds.has(e.source) && keptIds.has(e.target)) {
        adj.get(e.source)!.add(e.target);
        adj.get(e.target)!.add(e.source);
      }
    }
    const reachable = new Set<string>([focusId]);
    const queue: Array<{ id: string; d: number }> = [{ id: focusId, d: 0 }];
    while (queue.length > 0) {
      const { id, d } = queue.shift()!;
      if (d >= focusDepth) continue;
      for (const n of adj.get(id) || []) {
        if (!reachable.has(n)) {
          reachable.add(n);
          queue.push({ id: n, d: d + 1 });
        }
      }
    }
    keptIds = reachable;
  }

  // ---- 9. Финальные edges/nodes + degrees ----
  const finalEdges = workingEdges.filter(
    (e) => keptIds.has(e.source) && keptIds.has(e.target),
  );
  const finalNodes = workingNodes.filter((n) => keptIds.has(n.id));

  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  finalNodes.forEach((n) => {
    inDeg.set(n.id, 0);
    outDeg.set(n.id, 0);
  });
  for (const e of finalEdges) {
    outDeg.set(e.source, (outDeg.get(e.source) || 0) + 1);
    inDeg.set(e.target, (inDeg.get(e.target) || 0) + 1);
  }

  // ---- 10. Hub threshold ----
  const degrees = finalNodes.map(
    (n) => (inDeg.get(n.id) || 0) + (outDeg.get(n.id) || 0),
  );
  degrees.sort((a, b) => b - a);
  const hubThreshold = Math.max(2, degrees[4] || 0);

  finalNodes.forEach((n) => {
    n.inDegree = inDeg.get(n.id) || 0;
    n.outDegree = outDeg.get(n.id) || 0;
    n.degree = n.inDegree + n.outDegree;
    n.isOrphan = n.degree === 0;
    n.isHub = n.degree >= hubThreshold && n.degree > 0;
  });

  // ---- 11. Обрезка по limit (по degree) ----
  let limitedNodes = finalNodes.slice().sort((a, b) => {
    if (b.degree !== a.degree) return b.degree - a.degree;
    return a.id.localeCompare(b.id);
  });
  const truncated = Math.max(0, limitedNodes.length - limit);
  limitedNodes = limitedNodes.slice(0, limit);
  const limitedIds = new Set(limitedNodes.map((n) => n.id));
  const limitedEdges = finalEdges.filter(
    (e) => limitedIds.has(e.source) && limitedIds.has(e.target),
  );

  // ---- 12. Stats ----
  const byEdgeKind: Record<ViewEdgeKind, number> = {
    action: 0,
    tabs: 0,
    nested: 0,
    menu: 0,
    dashboard: 0,
    mixin: 0,
  };
  limitedEdges.forEach((e) => byEdgeKind[e.kind]++);

  const byNodeKind: Record<ViewNodeKind, number> = {
    entity: 0,
    list: 0,
    panel: 0,
    modal: 0,
    page: 0,
    tabs_list: 0,
    dashboard: 0,
    dashboard_tree: 0,
    menu: 0,
    menuItem: 0,
    unknown: 0,
  };
  limitedNodes.forEach((n) => byNodeKind[n.kind]++);

  const crossDomainEdges = limitedEdges.filter((e) => e.isCrossDomain).length;

  return {
    nodes: limitedNodes,
    edges: limitedEdges,
    stats: {
      totalNodes: limitedNodes.length,
      totalEdges: limitedEdges.length,
      byEdgeKind,
      byNodeKind,
      orphans: limitedNodes.filter((n) => n.isOrphan).length,
      unresolved: limitedNodes.filter((n) => n.unresolved).length,
      hubs: limitedNodes.filter((n) => n.isHub).length,
      crossDomainEdges,
      focusedId: effectiveFocus,
      truncated,
    },
  };
}

// ============ Internal helpers ============

function findActionOwnerViews(
  actionId: string,
  domainId: string,
  index: ModelIndex,
): string[] {
  const out: string[] = [];
  const lower = domainId.toLowerCase();
  for (const w of index.viewWidgets || []) {
    if (w.domainId.toLowerCase() !== lower) continue;
    if (w.type !== "action") continue;
    const ids = w.actionIds || [];
    if (ids.includes(actionId)) {
      out.push(qid(w.domainId, w.parentViewId));
    }
  }
  return out;
}

/** Сущности без entity-view. */
export function findEntitiesWithoutView(index: ModelIndex): Array<{
  fqid: string;
  domainId: string;
  entityId: string;
}> {
  const out: Array<{ fqid: string; domainId: string; entityId: string }> = [];
  const covered = new Set<string>();
  for (const [domainId, schema] of Object.entries(
    index.schemasByDomain || {},
  )) {
    for (const v of schema.sections.views.items) {
      if (v.type === "entity" && v.entity) {
        const fqid = normalizeEntity(v.entity, domainId);
        if (fqid) covered.add(fqid);
      }
    }
  }
  for (const e of index.entities) {
    if (!covered.has(e.fqid.toLowerCase())) {
      out.push({ fqid: e.fqid, domainId: e.domainId, entityId: e.entityId });
    }
  }
  return out;
}

// re-export shortEntity for convenience
export { shortEntity };
