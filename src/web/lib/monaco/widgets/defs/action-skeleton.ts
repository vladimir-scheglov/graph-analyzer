import { insertBlock } from "../insert";
import type { WidgetDef } from "../types";

const SKELETONS: Record<string, string> = {
  open_panel:
    "type: open_panel\nentity: ${1:MyEntity}\npanel: ${2:panels_info}",
  open_modal:
    "type: open_modal\nentity: ${1:MyEntity}\nmodal: ${2:forms_new}\noperation: ${3:edit}",
  open_page:
    "type: open_page\nentity: ${1:MyEntity}\nview: ${2:pages_info}\noperation: ${3:create}",
  open_list:
    "type: open_list\nview: ${1:lists_my}\ncontextPin: false\npage: current",
  open_tree: "type: open_tree\nview: ${1:trees_my}",
  remove: "type: remove\nentity: ${1:MyEntity}",
  bulk: "type: bulk\nentity: ${1:MyEntity}\noperation: remove",
  automation:
    "type: automation\nentity: ${1:MyEntity}\nautomation:\n  id: ${2:00000000-0000-0000-0000-000000000000}",
  scenario:
    "type: scenario\nentity: ${1:MyEntity}\nscenario: ${2:my_scenario}\nworkerTag: ${3:default}",
};

export const actionSkeletonWidget: WidgetDef = {
  id: "action-skeleton",
  title: "Тип action",
  priority: 85,
  getActions(ctx) {
    if (ctx.section !== "actions") return [];
    if (ctx.fieldName && ctx.fieldName !== "id") return [];
    const hasType = ctx.blockLines.some((ln) =>
      /^\s*type\s*:/.test(ctx.model.getLineContent(ln)),
    );
    if (hasType) return [];

    const fieldIndent = ctx.currentIndent + "  ";
    return Object.entries(SKELETONS).map(([t, sk]) => ({
      id: "act-" + t,
      label: t,
      icon: "bolt",
      run: (c, ed, m) =>
        insertBlock(ed, m, { ...c, currentIndent: c.currentIndent + "  " }, sk),
    }));
  },
};
