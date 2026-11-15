import { insertRawAt } from "../insert";
import type { WidgetAction, WidgetDef } from "../types";

export const bulkWizardWidget: WidgetDef = {
  id: "bulk-wizard",
  title: "Bulk action",
  priority: 84,
  getActions(ctx) {
    if (ctx.section !== "actions") return [];
    const lines = ctx.blockLines.map((ln) => ctx.model.getLineContent(ln));
    const typeLine = lines.find((l) => /^\s*type\s*:/.test(l));
    if (!typeLine || !/type\s*:\s*bulk\b/.test(typeLine)) return [];
    const hasAttrs = lines.some((l) => /^\s*attributes\s*:/.test(l));
    const hasLinkages = lines.some((l) => /^\s*linkages\s*:/.test(l));

    const lastLine = ctx.blockLines[ctx.blockLines.length - 1];
    const indent = ctx.currentIndent + "  ";
    const actions: WidgetAction[] = [];

    if (!hasAttrs) {
      actions.push({
        id: "bulk-attrs",
        label: "+ attributes (specific)",
        icon: "list",
        run: (_c: any, ed: any, m: any) => {
          const text = [
            "attributes:",
            "  type: specific",
            "  use:",
            "    - attribute: ${1:myAttr}",
          ].join("\n");
          insertRawAt(ed, m, lastLine, indent, text);
        },
      });
    }
    if (!hasLinkages) {
      actions.push({
        id: "bulk-lnk",
        label: "+ linkages (specific)",
        icon: "link",
        run: (_c: any, ed: any, m: any) => {
          const text = [
            "linkages:",
            "  type: specific",
            "  use:",
            "    - widget: ${1:editors_myLinkage}",
          ].join("\n");
          insertRawAt(ed, m, lastLine, indent, text);
        },
      });
    }
    return actions;
  },
};
