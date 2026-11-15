import { insertRawAt } from "../insert";
import type { WidgetContext, WidgetDef } from "../types";

function buildSkeleton(
  entityId: string,
  withModal: boolean,
  withPage: boolean,
): string {
  const parts: string[] = [];

  parts.push("widgets:");
  parts.push("  - id: editors_id");
  parts.push("    type: attribute");
  parts.push("    attribute: id");
  parts.push("  - id: editors_name");
  parts.push("    type: attribute");
  parts.push("    attribute: name");

  parts.push("groups:");
  parts.push("  - id: blocks_main");
  parts.push("    type: block");
  parts.push("    layout:");
  parts.push("      direction: column");
  parts.push("    components:");
  parts.push("      - widget: editors_id");
  parts.push("      - widget: editors_name");
  parts.push("  - id: tabs_main");
  parts.push("    type: tab");
  parts.push("    label: ${1:Основное}");
  parts.push("    components:");
  parts.push("      - block: blocks_main");

  parts.push("views:");
  parts.push("  - id: panels_info");
  parts.push("    type: panel");
  parts.push("    tabs:");
  parts.push("      - tab: tabs_main");

  if (withModal) {
    parts.push("  - id: forms_new");
    parts.push("    type: modal");
    parts.push("    form: blocks_main");
    parts.push("    label: ${2:Создание}");
  }
  if (withPage) {
    parts.push("  - id: pages_info");
    parts.push("    type: page");
    parts.push("    actionPanel: []");
    parts.push("    tabs:");
    parts.push("      - tab: tabs_main");
  }

  return parts.join("\n");
}

function pickEntityId(ctx: WidgetContext): string {
  const m = ctx.model.getLineContent(ctx.currentLine);
  // ищем `entity: X` ниже в блоке
  for (const ln of ctx.blockLines) {
    const t = ctx.model.getLineContent(ln);
    const mm = t.match(/^\s*entity\s*:\s*["']?([^\s"'#]+)["']?/);
    if (mm) return mm[1];
  }
  return "${1:MyEntity}";
}

export const entityviewSkeletonWidget: WidgetDef = {
  id: "entityview-skeleton",
  title: "Скелет entity-view",
  priority: 82,
  getActions(ctx) {
    if (ctx.section !== "views") return [];
    if (ctx.fieldName !== "id") return [];

    const blockText = ctx.blockLines
      .map((ln) => ctx.model.getLineContent(ln))
      .join("\n");

    // Только для entity-view — не для list / tree / tabs_list / dashboard*
    const typeM = blockText.match(/^\s*type\s*:\s*(\w+)/m);
    if (!typeM || typeM[1] !== "entity") return [];

    // Уже есть widgets/groups/views — skeleton не нужен
    if (/^\s*(?:widgets|groups|views)\s*:/m.test(blockText)) return [];

    const entityId = pickEntityId(ctx);
    const lastLine = ctx.blockLines[ctx.blockLines.length - 1];
    const indent = ctx.currentIndent + "  ";

    return [
      {
        id: "sk-full",
        label: "+ панель+модалка+вкладки",
        icon: "dashboard_customize",
        run: (_c, ed, m) =>
          insertRawAt(
            ed,
            m,
            lastLine,
            indent,
            buildSkeleton(entityId, true, false),
          ),
      },
      {
        id: "sk-page",
        label: "+ полная карточка",
        icon: "web",
        run: (_c, ed, m) =>
          insertRawAt(
            ed,
            m,
            lastLine,
            indent,
            buildSkeleton(entityId, true, true),
          ),
      },
    ];
  },
};
