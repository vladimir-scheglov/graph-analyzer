import { insertRawAt } from "../insert";
import type { WidgetContext, WidgetDef } from "../types";

function findViewWidgetsInsert(
  model: any,
  viewId: string,
): { insertLine: number; indent: string } | null {
  const lineCount = model.getLineCount();
  let inViews = false;
  let viewStart = -1;
  let viewIndent = -1;
  let viewEnd = -1;

  for (let i = 1; i <= lineCount; i++) {
    const t = model.getLineContent(i);
    const ind = t.match(/^(\s*)/)?.[1].length || 0;
    if (ind === 0) {
      inViews = /^views\s*:/.test(t);
      continue;
    }
    if (!inViews) continue;
    const m = t.match(/^(\s*)-\s+id:\s*["']?([^\s"'#]+)["']?/);
    if (!m) continue;
    if (viewStart < 0) {
      if (m[2] === viewId) {
        viewStart = i;
        viewIndent = m[1].length;
      }
    } else if (m[1].length === viewIndent) {
      viewEnd = i - 1;
      break;
    }
  }
  if (viewStart < 0) return null;
  if (viewEnd < 0) viewEnd = lineCount;

  let widgetsLine = -1;
  let widgetsIndent = -1;
  for (let i = viewStart + 1; i <= viewEnd; i++) {
    const t = model.getLineContent(i);
    const ind = t.match(/^(\s*)/)?.[1].length || 0;
    if (ind <= viewIndent) break;
    const m = t.match(/^(\s*)widgets\s*:/);
    if (m) {
      widgetsLine = i;
      widgetsIndent = m[1].length;
      break;
    }
  }
  if (widgetsLine < 0) return null;

  let lastLine = widgetsLine;
  let itemIndent = -1;
  for (let i = widgetsLine + 1; i <= viewEnd; i++) {
    const t = model.getLineContent(i);
    const ind = t.match(/^(\s*)/)?.[1].length || 0;
    if (!t.trim()) {
      lastLine = i;
      continue;
    }
    if (ind <= widgetsIndent) break;
    if (/^\s*-\s+id\s*:/.test(t) && itemIndent < 0) itemIndent = ind;
    lastLine = i;
  }
  return {
    insertLine: lastLine,
    indent: " ".repeat(itemIndent > 0 ? itemIndent : widgetsIndent + 2),
  };
}

function attributeToYaml(attr: any, id: string): string {
  const out = ["- id: " + id, "  type: attribute", "  attribute: " + attr.id];
  const ctrl =
    attr.dataType === "Bool"
      ? "switch"
      : attr.dataType === "Enum" || attr.dataType === "Workflow"
        ? "select"
        : attr.dataType === "Timestamp"
          ? "timestamp"
          : "text";
  out.push("  control:");
  out.push("    type: " + ctrl);
  return out.join("\n");
}

/** Только entity-view текущей сущности (list / tree / dashboard / tabs_list — мимо). */
function getEntityViews(ctx: WidgetContext): Array<{ id: string }> {
  if (!ctx.index || !ctx.entity) return [];
  const schema = ctx.index.schemasByDomain[ctx.currentDomain];
  if (!schema) return [];

  const fqid = ctx.entity.fqid.toLowerCase();
  const out: Array<{ id: string }> = [];
  for (const v of schema.sections.views.items as any[]) {
    if (v.type !== "entity") continue; // ← отсекаем list/tree/tabs_list/…
    if (v.isMixin) continue;
    const raw = v.entity;
    if (!raw) continue;
    const viewFqid = String(raw).includes("/")
      ? String(raw).toLowerCase()
      : `${ctx.currentDomain}/${raw}`.toLowerCase();
    if (viewFqid !== fqid) continue;
    out.push({ id: v.id });
  }
  return out;
}

/** Все view текущей сущности, включая вложенные panel/modal/page. */
function collectAllViewIdsForEntity(ctx: WidgetContext): Set<string> {
  const result = new Set<string>();
  if (!ctx.index || !ctx.entity) return result;
  const schema = ctx.index.schemasByDomain[ctx.currentDomain];
  if (!schema) return result;

  const all = (schema.allViews || []) as any[];
  const byId = new Map(all.map((v) => [v.id, v]));

  // Все top-level entity-views текущей сущности
  const tops: string[] = [];
  for (const v of schema.sections.views.items as any[]) {
    if (v.type !== "entity" || v.isMixin) continue;
    const raw = v.entity;
    if (!raw) continue;
    const viewFqid = String(raw).includes("/")
      ? String(raw).toLowerCase()
      : `${ctx.currentDomain}/${raw}`.toLowerCase();
    if (viewFqid === ctx.entity.fqid.toLowerCase()) tops.push(v.id);
  }

  // Рекурсивно добавляем все вложенные
  const stack = [...tops];
  while (stack.length) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    for (const v of all) {
      if (v.parentViewId === id && !result.has(v.id)) {
        stack.push(v.id);
      }
    }
  }
  return result;
}

export const widgetGeneratorWidget: WidgetDef = {
  id: "widget-generator",
  title: "Виджет в view",
  priority: 75,
  getActions(ctx) {
    if (ctx.section !== "entities") return [];
    if (ctx.fieldName !== "id") return [];
    if (!ctx.entity) return [];

    // Только `- id: <attr>` в attributes[]
    const lineCtx = ctx.lineMap?.lineContexts.get(ctx.currentLine);
    const isAttr = lineCtx?.breadcrumbs.some(
      (b: any) => b.type === "attribute" && b.line === ctx.currentLine,
    );
    if (!isAttr) return [];

    const attrId = (ctx.fieldValue || "").trim();
    const attr = ctx.entity.attributes.find((a: any) => a.id === attrId);
    if (!attr) return [];

    const views = getEntityViews(ctx);
    if (views.length === 0) return [];

    // Куда редактор мог бы уже лечь: все view (top + nested)
    const relatedViewIds = collectAllViewIdsForEntity(ctx);

    // Все существующие виджеты для этого атрибута во всех связанных view
    const viewWidgets = ctx.index?.viewWidgets || [];
    const alreadyWidgets = viewWidgets.filter(
      (w: any) =>
        w.attribute === attrId &&
        (relatedViewIds.has(w.parentViewId) ||
          // список parentViewId может быть неполным, но и top-level проверим
          views.some((v) => v.id === w.parentViewId)),
    );

    // В list-view тоже может быть «редактор» — но там это column.
    const viewColumns = (ctx.index as any)?.viewColumns || [];
    const alreadyColumns = viewColumns.filter(
      (c: any) => c.attribute === attrId && relatedViewIds.has(c.viewId),
    );

    if (alreadyWidgets.length > 0 || alreadyColumns.length > 0) return [];

    // Найти top-level entity-view, куда вставлять
    const target = views.find(
      (v) =>
        !viewWidgets.some(
          (w: any) => w.parentViewId === v.id && w.attribute === attrId,
        ),
    );
    if (!target) return [];

    const widgetId = "editors_" + attrId;
    return [
      {
        id: "wg-" + target.id,
        label: "+ " + widgetId + " → " + target.id,
        icon: "widgets",
        hint: `Добавить виджет для ${attrId} в ${target.id}.widgets[]`,
        run: (_c: WidgetContext, ed: any, m: any) => {
          const insert = findViewWidgetsInsert(ctx.model, target.id);
          if (!insert) {
            console.warn(
              "[widget-generator] widgets[] не найден в " + target.id,
            );
            return;
          }
          insertRawAt(
            ed,
            m,
            insert.insertLine,
            insert.indent,
            attributeToYaml(attr, widgetId),
          );
        },
      },
    ];
  },
};
