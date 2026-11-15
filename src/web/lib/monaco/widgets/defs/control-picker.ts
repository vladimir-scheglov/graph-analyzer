import { insertRawAt } from "../insert";
import type { WidgetContext, WidgetDef } from "../types";

const CONTROL_TYPES: Record<string, string[]> = {
  Bool: ["switch", "checkbox", "bool_text"],
  Enum: ["select", "radio", "tag", "level"],
  Workflow: ["select", "level", "tag"],
  Timestamp: ["timestamp", "date", "time"],
  Date: ["date"],
  Time: ["time"],
  TimestampRange: ["timestamp_range"],
  Attachment: ["drag_drop_area", "file"],
  String: ["text", "text_area"],
  Text: ["text_area"],
  Integer: ["text", "slider"],
  Decimal: ["text", "slider"],
  Float: ["text", "slider"],
  URL: ["text", "link"],
  Reference: ["select", "multi_select", "table"],
  Array: ["multi_select"],
  Table: ["table"],
};

function findViewEntity(ctx: WidgetContext): any | null {
  const lineCtx = ctx.lineMap?.lineContexts.get(ctx.currentLine);
  const viewNode = lineCtx?.breadcrumbs.find((b: any) => b.type === "view");
  if (!viewNode || !ctx.index) return null;

  const schema = ctx.index.schemasByDomain[ctx.currentDomain];
  const view = schema?.sections?.views?.items?.find(
    (v: any) => v.id === viewNode.id,
  );
  const raw = view?.entity || view?.sourceEntity;
  if (!raw) return null;

  const fqid = String(raw).includes("/")
    ? String(raw).toLowerCase()
    : `${ctx.currentDomain}/${raw}`.toLowerCase();
  return ctx.index.entitiesByFqid[fqid] || null;
}

export const controlPickerWidget: WidgetDef = {
  id: "control-picker",
  title: "control.type",
  priority: 90,
  getActions(ctx) {
    // Только views
    if (ctx.section !== "views") return [];

    // Только widgets[]
    const lineCtx = ctx.lineMap?.lineContexts.get(ctx.currentLine);
    const isWidget = lineCtx?.breadcrumbs.some((b: any) => b.type === "widget");
    if (!isWidget) return [];

    const blockText = ctx.blockLines
      .map((ln) => ctx.model.getLineContent(ln))
      .join("\n");

    // Виджет должен быть type: attribute (или type: ещё не задан)
    const typeM = blockText.match(/^\s*type\s*:\s*(\w+)/m);
    if (typeM && typeM[1] !== "attribute") return [];

    // control: уже есть — не предлагаем
    if (/^\s*control\s*:/m.test(blockText)) return [];

    // Ищем attributeId
    let attributeId: string | null = null;
    if (ctx.fieldName === "attribute") {
      attributeId = (ctx.fieldValue || "").trim().replace(/^["']|["']$/g, "");
    } else {
      for (const ln of ctx.blockLines) {
        const t = ctx.model.getLineContent(ln);
        const m = t.match(/^\s*attribute\s*:\s*["']?([^\s"'#]+)["']?/);
        if (m) {
          attributeId = m[1];
          break;
        }
      }
    }
    if (!attributeId) return [];

    // Attribute record через entity текущего view
    const entity = findViewEntity(ctx);
    if (!entity) return [];
    const attr = entity.attributes.find((a: any) => a.id === attributeId);
    if (!attr) return [];

    const kinds = CONTROL_TYPES[attr.dataType];
    if (!kinds) return [];

    // Куда вставлять: после `attribute:`
    let attributeLine = ctx.currentLine;
    let attributeIndent = ctx.currentIndent;
    for (const ln of ctx.blockLines) {
      const t = ctx.model.getLineContent(ln);
      const m = t.match(/^(\s*)attribute\s*:/);
      if (m) {
        attributeLine = ln;
        attributeIndent = m[1];
        break;
      }
    }

    return kinds.map((k) => ({
      id: "ctrl-" + k,
      label: k,
      icon: "settings",
      hint: `control.type = ${k} для ${attr.dataType}`,
      run: (_c: WidgetContext, ed: any, m: any) => {
        let text = "control:\n  type: " + k;
        if (k === "bool_text") {
          text += "\n  trueText: ${1:Да}\n  falseText: ${2:Нет}";
        } else if (k === "slider") {
          text += "\n  step: ${1:1}";
        } else if (k === "tree_path") {
          text += "\n  tree: ${1:my_tree}";
        }
        insertRawAt(ed, m, attributeLine, attributeIndent, text);
      },
    }));
  },
};
