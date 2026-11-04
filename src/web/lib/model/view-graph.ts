import type {
  ModelIndex,
  DomainSchemaAllViewItem,
  ActionRecord,
  EntityLinkage,
} from "../../../shared/model-types";

export type ViewEdgeKind =
  | "action" // action.modal / panel / pageView / view
  | "tabs" // tabs_list.tabs[].view
  | "nested" // parentViewId (panel/modal/page внутри entity)
  | "menu" // menuItem → view
  | "dashboard" // dashboard.widgets / dashboard_tree.tree
  | "mixin"; // mixin.targetEntityFqid → entity view

export interface ViewGraphNode {
  id: string; // qualifiedId: `${domainId}/${viewId}`
  viewId: string;
  domainId: string;
  type: string; // entity | list | panel | modal | page | tabs_list | dashboard | dashboard_tree
  entity?: string | null;
  label?: string | null;
  isMixin?: boolean;
  isOrphan?: boolean; // нет входящих рёбер
  unresolved?: boolean; // FQID на чужой домен, которого нет в кэше
}

export interface ViewGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: ViewEdgeKind;
  label?: string;
  /** Доп. данные для тултипа. */
  detail?: string;
}

export interface ViewGraphResult {
  nodes: ViewGraphNode[];
  edges: ViewGraphEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    byKind: Record<ViewEdgeKind, number>;
    orphans: number;
    unresolved: number;
  };
}

export interface ViewGraphOptions {
  domainFilter?: Set<string>;
  includeNested?: boolean;
  includeMixins?: boolean;
  includeDashboards?: boolean;
  /**
   * Показывать только междоменные связи + узлы, участвующие в них.
   * Внутридоменные связи и orphaned-узлы отбрасываются.
   * Используется в режиме «все домены» — иначе граф превращается в кашу.
   */
  crossDomainOnly?: boolean;
  limit?: number;
}

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

export function buildViewGraph(
  index: ModelIndex,
  options: ViewGraphOptions = {},
): ViewGraphResult {
  const includeNested = options.includeNested !== false;
  const includeMixins = options.includeMixins !== false;
  const includeDashboards = options.includeDashboards !== false;
  const limit = options.limit ?? 500;
  const domainFilter = options.domainFilter;

  // ── 1. Собираем все views всех доменов ──
  const nodes = new Map<string, ViewGraphNode>();
  const edges: ViewGraphEdge[] = [];
  const edgeIds = new Set<string>();

  const addEdge = (e: ViewGraphEdge) => {
    if (e.source === e.target) return; // self-loop
    if (edgeIds.has(e.id)) return;
    edgeIds.add(e.id);
    edges.push(e);
  };

  interface ViewMeta {
    domainId: string;
    view: DomainSchemaAllViewItem;
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
      allViews.push({ domainId, view: v as DomainSchemaAllViewItem });
    }
    for (const v of schema.allViews || []) {
      if (!v.id || seen.has(v.id)) continue;
      seen.add(v.id);
      allViews.push({ domainId, view: v });
    }
  }

  // ── 2. Создаём узлы ──
  for (const { domainId, view } of allViews) {
    const id = qid(domainId, view.id);
    const isUnresolved =
      view.entity != null &&
      !index.entitiesByFqid[normalizeEntity(view.entity, domainId) || ""];
    nodes.set(id, {
      id,
      viewId: view.id,
      domainId,
      type: view.type || "unknown",
      entity: view.entity ?? null,
      label: view.label ?? null,
      isMixin: (view as any).isMixin === true,
      isOrphan: false,
      unresolved: isUnresolved,
    });
  }

  // ── 3. Actions → views ──
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
    for (const r of refs) {
      if (!r.value) continue;
      const targetDomain = r.value.includes("/")
        ? r.value.split("/")[0]
        : a.domainId;
      const targetId = r.value.includes("/") ? r.value.split("/")[1] : r.value;
      const target = qid(targetDomain, targetId);
      if (!nodes.has(target)) continue;
      // Источник — единственный view, куда "прицепится" action. В YAML это view из actionPanel.
      // Ставим от action-владельца: view, где находится виджет этого action.
      const ownerViews = findActionOwnerViews(a.id, a.domainId, index);
      for (const owner of ownerViews) {
        if (!nodes.has(owner)) continue;
        addEdge({
          id: `action:${owner}:${target}:${a.id}`,
          source: owner,
          target,
          kind: "action",
          label: a.id,
          detail: `type: ${a.type}`,
        });
      }
    }
  }

  // ── 4. tabs_list ──
  for (const { domainId, view } of allViews) {
    if (view.type !== "tabs_list" || !view.tabs) continue;
    const src = qid(domainId, view.id);
    for (const t of view.tabs) {
      const tDomain = t.includes("/") ? t.split("/")[0] : domainId;
      const tId = t.includes("/") ? t.split("/")[1] : t;
      const target = qid(tDomain, tId);
      if (!nodes.has(target)) continue;
      addEdge({
        id: `tabs:${src}:${target}`,
        source: src,
        target,
        kind: "tabs",
      });
    }
  }

  // ── 5. nested views (parentViewId) ──
  if (includeNested) {
    for (const { domainId, view } of allViews) {
      if (!view.parentViewId) continue;
      const parent = qid(domainId, view.parentViewId);
      const child = qid(domainId, view.id);
      if (!nodes.has(parent) || !nodes.has(child)) continue;
      addEdge({
        id: `nested:${parent}:${child}`,
        source: parent,
        target: child,
        kind: "nested",
        detail: view.type,
      });
    }
  }

  // ── 6. menus → views ──
  for (const menu of index.menus || []) {
    if (
      domainFilter &&
      domainFilter.size > 0 &&
      !domainFilter.has(menu.domainId.toLowerCase())
    )
      continue;
    const src = qid(menu.domainId, `menu:${menu.id}`);
    // Меню не является view-узлом — пропускаем, если не добавили.
    // Здесь только если target view есть.
    const check = (viewRef: string | undefined) => {
      if (!viewRef) return;
      const tDom = viewRef.includes("/")
        ? viewRef.split("/")[0]
        : menu.domainId;
      const tId = viewRef.includes("/") ? viewRef.split("/")[1] : viewRef;
      const target = qid(tDom, tId);
      // Источник — сама menu, добавляем как псевдо-узел? Нет. Ставим ребро от "menu:<id>" → view.
      // Так как menu нет в nodes, узел не отобразится. Значит, пропускаем.
      // Альтернатива — добавить virtual nodes для menu. Оставляем как есть — меню в view-графе информативно только как "кто вызывает".
      // Для простоты не добавляем.
      void target;
    };
    check(menu.view);
    for (const it of menu.items || []) check(it.view);
  }

  // ── 7. dashboard_tree ──
  // У `DomainSchemaAllViewItem` нет dashboardTreeViews — итерируем sections.views.items
  // (тип `DomainSchemaViewItem`), где это поле объявлено.
  // `dashboardWidgets` — это id виджетов, а не views, поэтому для графа
  // зависимостей между views они не нужны (пропускаем).
  if (includeDashboards) {
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
      const items = schema.sections.views.items || [];
      for (const v of items) {
        if (v.type !== "dashboard_tree") continue;
        const treeViews = v.dashboardTreeViews;
        if (!Array.isArray(treeViews) || treeViews.length === 0) continue;
        const src = qid(domainId, v.id);
        if (!nodes.has(src)) continue;
        for (const vId of treeViews) {
          const target = qid(domainId, vId);
          if (!nodes.has(target)) continue;
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

  // ── 8. mixins → entity view ──
  if (includeMixins) {
    for (const m of index.mixins || []) {
      if (
        domainFilter &&
        domainFilter.size > 0 &&
        !domainFilter.has(m.domainId.toLowerCase())
      )
        continue;
      // Найти entity-view для targetEntityFqid
      const targetFqid = m.targetEntityFqid.toLowerCase();
      for (const { domainId, view } of allViews) {
        if (view.type !== "entity") continue;
        const ev = normalizeEntity(view.entity, domainId);
        if (ev !== targetFqid) continue;
        const target = qid(domainId, view.id);
        if (!nodes.has(target)) continue;
        // Источник — любой view в домене mixin-источника (по m.domainId)
        for (const { domainId: d2, view: v2 } of allViews) {
          if (d2.toLowerCase() !== m.domainId.toLowerCase()) continue;
          if (v2.type !== "entity") continue;
          const src = qid(d2, v2.id);
          if (!nodes.has(src)) continue;
          addEdge({
            id: `mixin:${src}:${target}:${m.id}`,
            source: src,
            target,
            kind: "mixin",
            label: m.id,
          });
        }
      }
    }
  }

  // ── 9. Фильтр cross-domain (для «все домены») ──
  let workingNodes = Array.from(nodes.values());
  let workingEdges = edges;

  if (options.crossDomainOnly) {
    workingEdges = edges.filter((e) => {
      const srcDom = e.source.split("/")[0];
      const tgtDom = e.target.split("/")[0];
      return srcDom !== tgtDom;
    });
    const involved = new Set<string>();
    for (const e of workingEdges) {
      involved.add(e.source);
      involved.add(e.target);
    }
    workingNodes = workingNodes.filter((n) => involved.has(n.id));
  }

  // ── 10. Подсчёт входящих ──
  const incomingCount = new Map<string, number>();
  for (const e of workingEdges) {
    incomingCount.set(e.target, (incomingCount.get(e.target) || 0) + 1);
  }

  // ── 11. Сортировка по входящим ──
  workingNodes.sort((a, b) => {
    const ia = incomingCount.get(a.id) || 0;
    const ib = incomingCount.get(b.id) || 0;
    if (ia !== ib) return ib - ia;
    return a.id.localeCompare(b.id);
  });

  // ── 12. Trim до limit ──
  const limited = workingNodes.slice(0, limit);
  const limitedIds = new Set(limited.map((n) => n.id));

  // ── 13. Помечаем orphans (нет ни входящих, ни исходящих) ──
  for (const n of limited) {
    const hasIn = (incomingCount.get(n.id) || 0) > 0;
    const hasOut = workingEdges.some((e) => e.source === n.id);
    if (!hasIn && !hasOut) n.isOrphan = true;
  }

  const filteredEdges = workingEdges.filter(
    (e) => limitedIds.has(e.source) && limitedIds.has(e.target),
  );

  const byKind: Record<ViewEdgeKind, number> = {
    action: 0,
    tabs: 0,
    nested: 0,
    menu: 0,
    dashboard: 0,
    mixin: 0,
  };
  for (const e of filteredEdges) byKind[e.kind]++;

  return {
    nodes: limited,
    edges: filteredEdges,
    stats: {
      totalNodes: limited.length,
      totalEdges: filteredEdges.length,
      byKind,
      orphans: limited.filter((n) => n.isOrphan).length,
      unresolved: limited.filter((n) => n.unresolved).length,
    },
  };
}

/** Какие view «владеют» action-виджетом этого action. */
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

/** Список сущностей-«получателей» по FQID, для которых нет entity-view. */
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
