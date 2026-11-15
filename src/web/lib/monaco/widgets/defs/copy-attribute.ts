import { insertAtCursor, insertBlock } from "../insert";
import type { WidgetContext, WidgetDef } from "../types";

function attributeToYaml(a: any, id: string): string {
  const out: string[] = ["- id: " + id];
  if (a.name) out.push("  name: " + a.name);
  if (a.description) {
    out.push(
      '  description: "' + String(a.description).replace(/"/g, '\\"') + '"',
    );
  }
  out.push("  dataType: " + a.dataType);
  if (a.referenceEntity) out.push("  entity: " + a.referenceEntity);
  if (a.itemDataType) {
    out.push("  item:");
    out.push("    dataType: " + a.itemDataType);
    if (a.itemReferenceEntity) out.push("    entity: " + a.itemReferenceEntity);
  }
  if (Array.isArray(a.constraints) && a.constraints.length > 0) {
    out.push("  constraints:");
    for (const c of a.constraints) out.push("    - kind: " + c);
  }
  return out.join("\n");
}

export const copyAttributeWidget: WidgetDef = {
  id: "copy-attribute",
  title: "Скопировать атрибут",
  priority: 50,
  getActions(ctx) {
    if (ctx.section !== "entities") return [];
    if (!ctx.entity) return [];
    const lineText = ctx.model.getLineContent(ctx.currentLine);
    if (lineText.trim() !== "") return [];

    // Ищем в текущей сущности блок attributes:
    const inAttrs = ctx.lineMap?.lineContexts
      .get(ctx.currentLine)
      ?.breadcrumbs.some((b: any) => b.id === "attributes");
    if (!inAttrs) return [];

    const existing = new Set(ctx.entity.attributes.map((a: any) => a.id));
    const seen = new Set<string>();
    const actions: any[] = [];

    for (const e of ctx.index?.entities || []) {
      if (e.domainId !== ctx.currentDomain) continue;
      if (e.fqid === ctx.entity.fqid) continue;
      for (const a of e.attributes) {
        if (existing.has(a.id)) continue;
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        actions.push({
          id: "cp-" + a.id,
          label: "+ " + a.id + " (" + e.entityId + ")",
          icon: "content_copy",
          hint: `${a.dataType}${a.description ? " · " + a.description : ""}`,
          run: (_c: any, ed: any, m: any) => {
            insertBlock(ed, m, _c, attributeToYaml(a, a.id));
          },
        });
        if (actions.length >= 5) return actions;
      }
    }
    return actions;
  },
};
