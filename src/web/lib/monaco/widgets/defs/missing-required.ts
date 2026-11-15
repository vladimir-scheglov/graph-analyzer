import { FIELD_DEFINITIONS } from "../../monaco-providers";
import { insertAtCursor } from "../insert";
import type { WidgetAction, WidgetDef } from "../types";

export const missingRequiredWidget: WidgetDef = {
  id: "missing-required",
  title: "Обязательные поля",
  priority: 100,
  getActions(ctx) {
    if (!ctx.context) return [];
    const defs = FIELD_DEFINITIONS[ctx.context] || [];
    const required = defs.filter((d) => d.required);
    if (required.length === 0) return [];

    const present = new Set<string>();
    for (const ln of ctx.blockLines) {
      const t = ctx.model.getLineContent(ln);
      const m = t.match(/^\s*(?:-\s+)?([a-zA-Z_][\w]*)\s*:/);
      if (m) present.add(m[1]);
    }

    const missing = required.filter((d) => !present.has(d.name));
    if (missing.length === 0) return [];

    const fieldIndent = ctx.currentIndent + "  ";
    const actions: WidgetAction[] = [];
    if (missing.length > 1) {
      actions.push({
        id: "all",
        label: `+ все (${missing.length})`,
        icon: "playlist_add",
        hint: "Вставить все отсутствующие обязательные поля",
        run: (c, ed, m) => {
          const text = missing
            .map((f) => "\n" + fieldIndent + f.name + ": ${1:}")
            .join("");
          insertAtCursor(ed, m, text);
        },
      });
    }
    for (const f of missing) {
      actions.push({
        id: "f-" + f.name,
        label: "+ " + f.name,
        icon: "add",
        hint: f.description,
        run: (c, ed, m) => {
          insertAtCursor(ed, m, "\n" + fieldIndent + f.name + ": ${1:}");
        },
      });
    }
    return actions;
  },
};
