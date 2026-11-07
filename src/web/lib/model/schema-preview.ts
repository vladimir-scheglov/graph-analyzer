import type {
  AttributeRecord,
  EntityLinkage,
  EntityRecord,
  ModelIndex,
} from "../../../shared/model-types";
import type { GeneratedBlock } from "../../../core/analyzer/schema-generator/types";

// ============ Типы ============

export interface PreviewWidget {
  id: string;
  type: string;
  label?: string;
  controlType?: string;
  linkageId?: string;
  actionIds?: string[];

  // ===== attribute-виджет =====
  attributeId?: string;
  attributeRecord?: AttributeRecord;
  dataType?: string;
  dataTypeKind?: "base" | "custom" | "unknown";
  constraints?: string[];
  required?: boolean;
  readonly?: boolean;
  /** Для Enum. */
  enumValues?: string[];
  /** Для Workflow. */
  workflowStatuses?: string[];
  initialStatus?: string;
  /** Для Reference / Array<Reference>. */
  referenceTarget?: string;

  // ===== linkage-виджет =====
  linkageName?: string;
  linkageSide?: 1 | 2;
  linkageType?: string;
  targetEntityId?: string;
  targetEntityName?: string;
}

export interface PreviewGroup {
  id: string;
  type: "block" | "form" | "tab" | "tabs" | "resizable_block_pair";
  label?: string;
  widgets: PreviewWidget[];
  nestedGroups: PreviewGroup[];
  /** Группа объявлена, но ни один widget/block в неё не пришёл. */
  isEmpty: boolean;
}

export interface PreviewTab {
  id: string;
  label: string;
  groupId: string;
  /** Группа-таргет отсутствует в превью. */
  missingGroup?: boolean;
}

export interface PreviewView {
  id: string;
  kind: "panel" | "modal" | "page" | "list" | "entity";
  label?: string;
  description?: string;
  entityFqid?: string | null;
  parentViewId?: string;
  widgets: PreviewWidget[];
  groups: PreviewGroup[];
  tabs: PreviewTab[];
  menu: string[];
  tableColumns?: Array<{
    id: string;
    label: string;
    attribute: string;
    attributeRecord?: AttributeRecord;
    dataType?: string;
    required?: boolean;
    readonly?: boolean;
  }>;
  actionPanel?: string[];
  /** Источник данных для list-view. */
  sourceEntity?: string;
  /** Inline-action items (для таблицы). */
  rowClickAction?: string;
  rowContextMenu?: Array<{ action: string; label?: string; icon?: string }>;
  selection?: boolean;
  paging?: { sizes: number[]; defaultSize?: number };
}

export interface PreviewAction {
  id: string;
  name: string;
  type: string;
  operation?: string;
  entity?: string;
  modal?: string;
  panel?: string;
  view?: string;
  pageView?: string;
  /** Куда ведёт (modal || panel || pageView || view) — уже нормализовано. */
  targetViewId?: string;
}

export interface PreviewIssue {
  severity: "error" | "warning";
  /** Какое view / action / группа поражены. */
  subject: string;
  message: string;
}

export interface SchemaPreview {
  entityId: string | null;
  entityFqid: string | null;
  domainId: string | null;
  views: PreviewView[];
  actions: PreviewAction[];
  /** fqid → цепочка предков (включая самого себя). */
  entityChain: EntityRecord[];
  /** Проблемы целостности — «сломано / пусто / ссылка в никуда». */
  issues: PreviewIssue[];
  skippedBlocks: number;
}

// ============ Хелперы ============

function resolveAttributeChain(
  fqid: string | null | undefined,
  index: ModelIndex | null,
): {
  chain: EntityRecord[];
  attributes: Map<string, AttributeRecord>;
} {
  const result = {
    chain: [] as EntityRecord[],
    attributes: new Map<string, AttributeRecord>(),
  };
  if (!fqid || !index) return result;

  let cur: EntityRecord | undefined = index.entitiesByFqid[fqid.toLowerCase()];
  const seen = new Set<string>();
  while (cur && !seen.has(cur.fqid)) {
    seen.add(cur.fqid);
    result.chain.push(cur);
    for (const a of cur.attributes) {
      if (!result.attributes.has(a.id)) result.attributes.set(a.id, a);
    }
    cur = cur.inherits ? index.entitiesByFqid[cur.inherits] : undefined;
  }
  return result;
}

function enrichAttribute(
  attrId: string | undefined,
  attributesMap: Map<string, AttributeRecord>,
  index: ModelIndex | null,
  domainId: string | null,
): Partial<PreviewWidget> {
  if (!attrId || !attributesMap.has(attrId)) {
    return attrId ? { attributeId: attrId } : {};
  }
  const a = attributesMap.get(attrId)!;
  const out: Partial<PreviewWidget> = {
    attributeId: attrId,
    attributeRecord: a,
    dataType: a.dataType,
    dataTypeKind: a.dataTypeKind,
    constraints: a.constraints,
    required: a.constraints.includes("required"),
    readonly: a.readonly === true,
  };

  // Для Enum/Workflow — резолвим из index.dataTypes
  if (a.dataTypeKind === "custom" && index && domainId) {
    const dt = index.dataTypes.find(
      (d) => d.domainId === domainId && d.id === a.dataType,
    );
    if (dt?.kind === "Enum") {
      out.enumValues = dt.values || [];
    } else if (dt?.kind === "Workflow") {
      out.workflowStatuses = dt.statuses || [];
      out.initialStatus = dt.initial;
    }
  }

  // Reference target
  const ref = a.referenceEntity || a.itemReferenceEntity;
  if (ref) out.referenceTarget = ref;

  return out;
}

// ============ Сборка ============

export function buildSchemaPreview(
  blocks: GeneratedBlock[],
  meta: {
    entityId: string | null;
    domainId: string | null;
    index?: ModelIndex | null;
  },
): SchemaPreview {
  const index = meta.index ?? null;
  const entityFqid =
    meta.entityId && meta.domainId
      ? `${meta.domainId}/${meta.entityId}`.toLowerCase()
      : null;
  const { chain, attributes } = resolveAttributeChain(entityFqid, index);

  // ── 1. Индексируем блоки ──
  const widgetBlocks = new Map<string, GeneratedBlock>();
  const groupBlocks = new Map<string, GeneratedBlock>();
  const viewBlocks = new Map<string, GeneratedBlock>();
  const actionBlocks = new Map<string, GeneratedBlock>();
  let skipped = 0;

  for (const b of blocks) {
    const kind = b.blockId.split(":")[0];
    const id = b.payload?.id;
    if (!id) {
      skipped++;
      continue;
    }
    switch (kind) {
      case "widget":
        widgetBlocks.set(id, b);
        break;
      case "group":
        groupBlocks.set(id, b);
        break;
      case "view":
        viewBlocks.set(id, b);
        break;
      case "action":
        actionBlocks.set(id, b);
        break;
      default:
        skipped++;
        break;
    }
  }

  // ── 2. Резолвер виджета ──
  const resolveWidget = (id: string): PreviewWidget | null => {
    const b = widgetBlocks.get(id);
    if (!b) return null;
    const p = b.payload;
    const base: PreviewWidget = {
      id: p.id,
      type: p.type || "",
      label: p.label ?? p.attribute ?? p.linkage ?? p.action,
      controlType: p.control?.type,
      linkageId: p.linkage,
      actionIds: p.actions || (p.action ? [p.action] : undefined),
    };

    if (p.type === "attribute" && p.attribute) {
      Object.assign(
        base,
        enrichAttribute(p.attribute, attributes, index, meta.domainId),
      );
      // control.type из widget имеет приоритет над дефолтным по dataType
      if (p.control?.type) base.controlType = p.control.type;
      // label из control (для bool_text)
      if (p.control?.trueText || p.control?.falseText) {
        (base as any).trueText = p.control.trueText;
        (base as any).falseText = p.control.falseText;
      }
    }

    if (p.type === "linkage" && p.linkage && index) {
      const lk = index.entityLinkages.find(
        (l) =>
          l.domainId === meta.domainId &&
          (l.id === p.linkage || `${l.domainId}/${l.id}` === p.linkage),
      );
      if (lk) {
        base.linkageName = lk.name;
        base.linkageType = lk.type;
        base.linkageSide = p.side === 2 ? 2 : 1;
        const targetFqid = base.linkageSide === 1 ? lk.side2Fqid : lk.side1Fqid;
        base.targetEntityId = targetFqid.split("/")[1];
        base.targetEntityName = index.entitiesByFqid[targetFqid]?.name;
      }
    }

    return base;
  };

  // ── 3. Резолвер группы (рекурсивный) ──
  const resolveGroup = (id: string, depth = 0): PreviewGroup | null => {
    if (depth > 5) return null;
    const b = groupBlocks.get(id);
    if (!b) return null;
    const p = b.payload;
    const components: any[] = Array.isArray(p.components) ? p.components : [];
    const childWidgets: PreviewWidget[] = [];
    const childGroups: PreviewGroup[] = [];

    for (const c of components) {
      if (c?.widget) {
        const w = resolveWidget(c.widget);
        if (w) childWidgets.push(w);
      }
      if (c?.block) {
        const g = resolveGroup(c.block, depth + 1);
        if (g) childGroups.push(g);
      }
    }

    return {
      id: p.id,
      type: p.type || "block",
      label: p.label,
      widgets: childWidgets,
      nestedGroups: childGroups,
      isEmpty: childWidgets.length === 0 && childGroups.length === 0,
    };
  };

  // ── 4. Собираем actions ──
  const actions: PreviewAction[] = [];
  for (const [id, b] of actionBlocks) {
    const p = b.payload;
    const action: PreviewAction = {
      id,
      name: p.name || id,
      type: p.type || "",
      operation: p.operation,
      entity: p.entity,
      modal: p.modal,
      panel: p.panel,
      view: p.view,
      pageView: p.pageView,
    };
    action.targetViewId = p.modal || p.panel || p.pageView || p.view;
    actions.push(action);
  }

  // ── 5. Резолвер view ──
  const views: PreviewView[] = [];
  const processedViewIds = new Set<string>();

  for (const [viewId, b] of viewBlocks) {
    if (processedViewIds.has(viewId)) continue;
    const p = b.payload || {};
    const viewType = String(p.type || "");

    if (viewType === "list") {
      const columns = Array.isArray(p.table?.columns) ? p.table.columns : [];
      const enrichedColumns = columns.map((c: any) => {
        const attrId =
          typeof c.attribute === "string" ? c.attribute : undefined;
        const enriched = enrichAttribute(
          attrId,
          attributes,
          index,
          meta.domainId,
        );
        return {
          id: c.id,
          label: c.label || c.id,
          attribute: attrId || "",
          attributeRecord: enriched.attributeRecord,
          dataType: enriched.dataType,
          required: enriched.required,
          readonly: enriched.readonly,
        };
      });

      // row actions
      const rowActions = Array.isArray(p.table?.actions) ? p.table.actions : [];
      let rowClickAction: string | undefined;
      let rowContextMenu: Array<{
        action: string;
        label?: string;
        icon?: string;
      }> = [];
      for (const a of rowActions) {
        if (a.type === "row_click" && a.action) rowClickAction = a.action;
        else if (a.type === "row_context_menu" && Array.isArray(a.items)) {
          rowContextMenu = a.items.map((it: any) => ({
            action: it.action,
            label: it.label,
            icon: it.icon,
          }));
        }
      }

      views.push({
        id: viewId,
        kind: "list",
        label: p.label,
        entityFqid,
        parentViewId: b.parentViewId,
        widgets: [],
        groups: [],
        tabs: [],
        menu: [],
        tableColumns: enrichedColumns,
        actionPanel: Array.isArray(p.actionPanel)
          ? p.actionPanel.map((ap: any) => ap.widget).filter(Boolean)
          : [],
        sourceEntity: p.source?.entity,
        rowClickAction,
        rowContextMenu,
        selection: !!p.table?.selection,
        paging: p.table?.paging
          ? {
              sizes: Array.isArray(p.table.paging.sizes)
                ? p.table.paging.sizes
                : [],
              defaultSize: p.table.paging.defaultSize,
            }
          : undefined,
      });
      processedViewIds.add(viewId);
      continue;
    }

    if (viewType === "entity") {
      const childWidgets: PreviewWidget[] = [];
      const childGroups: PreviewGroup[] = [];

      for (const [wid, wb] of widgetBlocks) {
        if (wb.parentViewId !== viewId) continue;
        const w = resolveWidget(wid);
        if (w) childWidgets.push(w);
      }
      for (const [gid, gb] of groupBlocks) {
        if (gb.parentViewId !== viewId) continue;
        if (gb.payload?.type === "form") continue; // форма идёт в modal
        const g = resolveGroup(gid);
        if (g) childGroups.push(g);
      }

      views.push({
        id: viewId,
        kind: "entity",
        label: p.label,
        description: p.description,
        entityFqid,
        widgets: childWidgets,
        groups: childGroups,
        tabs: [],
        menu: [],
      });
      processedViewIds.add(viewId);

      // Вложенные карточки (panel/modal/page)
      for (const [vid, vb] of viewBlocks) {
        if (vb.parentViewId !== viewId) continue;
        const nested = buildNestedView(
          vid,
          vb,
          resolveWidget,
          resolveGroup,
          entityFqid,
          meta.domainId,
        );
        if (nested) {
          views.push(nested);
          processedViewIds.add(vid);
        }
      }
      continue;
    }

    // panel / modal / page — top-level, не через entity-view
    const nested = buildNestedView(
      viewId,
      b,
      resolveWidget,
      resolveGroup,
      entityFqid,
      meta.domainId,
    );
    if (nested) {
      views.push(nested);
      processedViewIds.add(viewId);
    }
  }

  // ── 6. Сортировка: entity → list → panel → modal → page ──
  const order: Record<string, number> = {
    entity: 0,
    list: 1,
    panel: 2,
    modal: 3,
    page: 4,
  };
  views.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));

  // ── 7. Проверка целостности ──
  const issues = checkIntegrity(views, actions);

  return {
    entityId: meta.entityId,
    entityFqid,
    domainId: meta.domainId,
    views,
    actions,
    entityChain: chain,
    issues,
    skippedBlocks: skipped,
  };
}

function buildNestedView(
  viewId: string,
  b: GeneratedBlock,
  resolveWidget: (id: string) => PreviewWidget | null,
  resolveGroup: (id: string, depth?: number) => PreviewGroup | null,
  entityFqid: string | null,
  domainId: string | null,
): PreviewView | null {
  const p = b.payload || {};
  const t = String(p.type || "");
  if (t !== "panel" && t !== "modal" && t !== "page") return null;

  const widgets: PreviewWidget[] = [];
  const groups: PreviewGroup[] = [];
  const tabs: PreviewTab[] = [];
  const menu: string[] = [];

  if (Array.isArray(p.menu)) {
    for (const m of p.menu) {
      if (m?.action) menu.push(m.action);
    }
  }

  if (Array.isArray(p.tabs)) {
    for (const t2 of p.tabs) {
      if (!t2?.tab) continue;
      const g = resolveGroup(t2.tab);
      if (g) {
        if (!groups.find((x) => x.id === g.id)) groups.push(g);
        tabs.push({ id: t2.tab, label: g.label || t2.tab, groupId: g.id });
      } else {
        // tab ссылается на несуществующую группу
        tabs.push({
          id: t2.tab,
          label: t2.tab,
          groupId: t2.tab,
          missingGroup: true,
        });
      }
    }
  }

  if (t === "modal" && p.form) {
    const g = resolveGroup(p.form);
    if (g) groups.push(g);
    else
      tabs.push({
        id: p.form,
        label: p.form,
        groupId: p.form,
        missingGroup: true,
      });
  }
  if (t === "page" && p.block) {
    const g = resolveGroup(p.block);
    if (g) groups.push(g);
  }

  return {
    id: viewId,
    kind: t as any,
    label: p.label,
    description: p.description,
    entityFqid,
    parentViewId: b.parentViewId,
    widgets,
    groups,
    tabs,
    menu,
    actionPanel: Array.isArray(p.actionPanel)
      ? p.actionPanel.map((ap: any) => ap.widget).filter(Boolean)
      : [],
  };
}

function checkIntegrity(
  views: PreviewView[],
  actions: PreviewAction[],
): PreviewIssue[] {
  const issues: PreviewIssue[] = [];
  const viewIds = new Set(views.map((v) => v.id));
  const groupIds = new Set<string>();
  for (const v of views) {
    const walk = (g: PreviewGroup) => {
      groupIds.add(g.id);
      for (const ng of g.nestedGroups) walk(ng);
    };
    for (const g of v.groups) walk(g);
  }

  // 1. Actions с несуществующим target
  for (const a of actions) {
    if (a.targetViewId && !viewIds.has(a.targetViewId)) {
      issues.push({
        severity: "error",
        subject: `action ${a.id}`,
        message: `${a.type} ссылается на несуществующий view «${a.targetViewId}»`,
      });
    }
  }

  // 2. Tab ссылается на несуществующую группу
  for (const v of views) {
    for (const t of v.tabs) {
      if (t.missingGroup) {
        issues.push({
          severity: "error",
          subject: `view ${v.id}`,
          message: `Tab «${t.id}» ссылается на несуществующую группу`,
        });
      }
    }
  }

  // 3. Пустые группы
  for (const v of views) {
    const walk = (g: PreviewGroup) => {
      if (g.isEmpty) {
        issues.push({
          severity: "warning",
          subject: `group ${g.id}`,
          message: `Группа «${g.id}» пуста — ни один widget/block не в неё пришёл`,
        });
      }
      for (const ng of g.nestedGroups) walk(ng);
    };
    for (const g of v.groups) walk(g);
  }

  // 4. Виджет-атрибут без attributeRecord
  for (const v of views) {
    const walk = (g: PreviewGroup) => {
      for (const w of g.widgets) {
        if (w.type === "attribute" && w.attributeId && !w.attributeRecord) {
          issues.push({
            severity: "warning",
            subject: `widget ${w.id}`,
            message: `Атрибут «${w.attributeId}» не найден в сущности (устаревший id)`,
          });
        }
      }
      for (const ng of g.nestedGroups) walk(ng);
    };
    for (const g of v.groups) walk(g);
  }

  return issues;
}

/** Группировка для подсчётов. */
export function countPreviewActionsByType(
  actions: PreviewAction[],
): Record<string, number> {
  const c: Record<string, number> = {};
  for (const a of actions) c[a.type] = (c[a.type] || 0) + 1;
  return c;
}
