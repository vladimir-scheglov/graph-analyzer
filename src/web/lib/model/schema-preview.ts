import type { GeneratedBlock } from "../../../core/analyzer/schema-generator/types";

export interface PreviewWidget {
  id: string;
  type: string;
  label?: string;
  controlType?: string;
  linkageId?: string;
  actions?: string[];
}

export interface PreviewGroup {
  id: string;
  type: "block" | "form" | "tab" | "tabs" | "resizable_block_pair";
  label?: string;
  widgets: PreviewWidget[];
  nestedGroups: PreviewGroup[];
}

export interface PreviewTab {
  id: string;
  label: string;
  groupId: string;
}

export interface PreviewView {
  id: string;
  kind: "panel" | "modal" | "page" | "list" | "entity";
  label?: string;
  widgets: PreviewWidget[];
  groups: PreviewGroup[];
  tabs: PreviewTab[];
  menu: string[]; // actionId[]
  tableColumns?: Array<{ id: string; label: string; attribute: string }>;
  actionPanel?: string[];
}

export interface SchemaPreview {
  entityId: string | null;
  domainId: string | null;
  /** По типу view. Порядок: entity → list → panel → modal → page. */
  views: PreviewView[];
  /** Сколько блоков было проигнорировано (orphaned/не-view). */
  skippedBlocks: number;
}

/**
 * Собирает превью из сгенерированных блоков.
 * Только view/action/widget/group — остальное игнорируется.
 */
export function buildSchemaPreview(
  blocks: GeneratedBlock[],
  meta: { entityId: string | null; domainId: string | null },
): SchemaPreview {
  const widgets = new Map<string, GeneratedBlock>();
  const groups = new Map<string, GeneratedBlock>();
  const viewBlocks = new Map<string, GeneratedBlock>();
  const actions = new Map<string, GeneratedBlock>();

  let skipped = 0;
  for (const b of blocks) {
    const kind = b.blockId.split(":")[0];
    switch (kind) {
      case "widget":
        widgets.set(b.payload?.id, b);
        break;
      case "group":
        groups.set(b.payload?.id, b);
        break;
      case "view":
        viewBlocks.set(b.payload?.id, b);
        break;
      case "action":
        actions.set(b.payload?.id, b);
        break;
      default:
        skipped++;
        break;
    }
  }

  const resolveWidget = (id: string): PreviewWidget | null => {
    const b = widgets.get(id);
    if (!b) return null;
    const p = b.payload;
    return {
      id: p.id,
      type: p.type || "",
      label: p.label ?? p.attribute ?? p.linkage ?? p.action,
      controlType: p.control?.type,
      linkageId: p.linkage,
      actions: p.actions || (p.action ? [p.action] : undefined),
    };
  };

  const resolveGroup = (id: string, depth = 0): PreviewGroup | null => {
    if (depth > 5) return null;
    const b = groups.get(id);
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
    };
  };

  const views: PreviewView[] = [];

  for (const [viewId, b] of viewBlocks) {
    const p = b.payload || {};
    const viewType = String(p.type || "");

    if (viewType === "list") {
      const columns = Array.isArray(p.table?.columns) ? p.table.columns : [];
      views.push({
        id: viewId,
        kind: "list",
        label: p.label,
        widgets: [],
        groups: [],
        tabs: [],
        menu: [],
        tableColumns: columns.map((c: any) => ({
          id: c.id,
          label: c.label || c.id,
          attribute: c.attribute || "",
        })),
        actionPanel: Array.isArray(p.actionPanel)
          ? p.actionPanel.map((ap: any) => ap.widget).filter(Boolean)
          : [],
      });
      continue;
    }

    if (viewType === "entity") {
      // Дети entity-view — widget/group/view с parentViewId === viewId
      const childWidgets: PreviewWidget[] = [];
      const childGroups: PreviewGroup[] = [];
      const childViews: PreviewView[] = [];

      for (const [, wb] of widgets) {
        if (wb.parentViewId === viewId) {
          const w = resolveWidget(wb.payload?.id);
          if (w) childWidgets.push(w);
        }
      }
      for (const [gid, gb] of groups) {
        if (gb.parentViewId === viewId && gb.payload?.type !== "form") {
          const g = resolveGroup(gid);
          if (g) childGroups.push(g);
        }
      }
      for (const [vid, vb] of viewBlocks) {
        if (vb.parentViewId === viewId) {
          const sub = buildSingleNestedView(
            vid,
            vb,
            resolveWidget,
            resolveGroup,
          );
          if (sub) childViews.push(sub);
        }
      }

      views.push({
        id: viewId,
        kind: "entity",
        label: p.label,
        widgets: childWidgets,
        groups: childGroups,
        tabs: [],
        menu: [],
      });
      views.push(...childViews);
      continue;
    }

    // panel / modal / page — если не попали в entity (nested), показываем отдельно
    const nested = buildSingleNestedView(
      viewId,
      b,
      resolveWidget,
      resolveGroup,
    );
    if (nested) views.push(nested);
  }

  // Сортировка: entity → list → panel → modal → page
  const order: Record<string, number> = {
    entity: 0,
    list: 1,
    panel: 2,
    modal: 3,
    page: 4,
  };
  views.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));

  return {
    entityId: meta.entityId,
    domainId: meta.domainId,
    views,
    skippedBlocks: skipped,
  };
}

function buildSingleNestedView(
  viewId: string,
  b: GeneratedBlock,
  resolveWidget: (id: string) => PreviewWidget | null,
  resolveGroup: (id: string, depth?: number) => PreviewGroup | null,
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
      const g = groups.find((x) => x.id === t2.tab) || resolveGroup(t2.tab);
      if (g) {
        if (!groups.find((x) => x.id === g.id)) groups.push(g);
        tabs.push({ id: t2.tab, label: g.label || t2.tab, groupId: g.id });
      }
    }
  }
  // Если модалка: form-группа из p.form
  if (t === "modal" && p.form) {
    const g = resolveGroup(p.form);
    if (g) groups.push(g);
  }
  // page: p.block — блок
  if (t === "page" && p.block) {
    const g = resolveGroup(p.block);
    if (g) groups.push(g);
  }

  return {
    id: viewId,
    kind: t as any,
    label: p.label,
    widgets,
    groups,
    tabs,
    menu,
  };
}

/** Собирает ModelIndex-совместимые "виртуальные" actions для превью. */
export function collectPreviewActions(
  blocks: GeneratedBlock[],
): Map<string, { id: string; name: string; type: string }> {
  const m = new Map<string, { id: string; name: string; type: string }>();
  for (const b of blocks) {
    if (b.section !== "actions") continue;
    const id = b.payload?.id;
    if (!id) continue;
    m.set(id, {
      id,
      name: b.payload.name || id,
      type: b.payload.type || "",
    });
  }
  return m;
}
