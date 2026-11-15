import { insertRawAt } from "../insert";
import type { WidgetContext, WidgetDef } from "../types";

interface FieldSkeleton {
  name: string;
  label: string;
  icon: string;
  snippet: string;
}

const ENTITY_FIELDS: FieldSkeleton[] = [
  { name: "label", label: "+ label", icon: "label", snippet: 'label: "{id}"' },
  {
    name: "description",
    label: "+ description",
    icon: "notes",
    snippet: 'description: "${1:Описание}"',
  },
  {
    name: "sorting",
    label: "+ sorting",
    icon: "sort",
    snippet: [
      "sorting:",
      "  - id: sorting_${1:name}",
      "    by:",
      "      - attribute: ${2:name}",
      "        direction: asc",
    ].join("\n"),
  },
  {
    name: "searching",
    label: "+ searching",
    icon: "search",
    snippet: [
      "searching:",
      "  attributes:",
      "    - ${1:id}",
      "    - ${2:name}",
    ].join("\n"),
  },
  {
    name: "identification",
    label: "+ identification",
    icon: "fingerprint",
    snippet: [
      "identification:",
      "  - id: ident_${1:name}",
      "    rule:",
      "      - attribute: ${2:name}",
    ].join("\n"),
  },
  {
    name: "reconciliation",
    label: "+ reconciliation",
    icon: "compare",
    snippet: [
      "reconciliation:",
      "  - attribute: ${1:name}",
      "    default:",
      "      - source: ${2:manual}",
    ].join("\n"),
  },
  {
    name: "projection",
    label: "+ projection",
    icon: "content_copy",
    snippet: ["projection:", "  - attribute: ${1:name}"].join("\n"),
  },
  {
    name: "graphView",
    label: "+ graphView",
    icon: "hub",
    snippet: ["graphView:", "  iconColor: ${1:blue}"].join("\n"),
  },
  {
    name: "treeNode",
    label: "+ treeNode",
    icon: "account_tree",
    snippet: ["treeNode:", "  types:", "    - type: ${1:root}"].join("\n"),
  },
];

interface EntityBlock {
  startLine: number;
  endLine: number;
  entityIndent: number;
}

function findEntityBlock(model: any, currentLine: number): EntityBlock | null {
  let startLine = -1;
  let entityIndent = -1;
  for (let i = currentLine; i >= 1; i--) {
    const t = model.getLineContent(i);
    if (!t.trim()) continue;
    const m = t.match(/^(\s*)-\s+id\s*:/);
    if (m) {
      entityIndent = m[1].length;
      startLine = i;
      break;
    }
    const ind = (t.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind === 0 && !/^\s*-\s/.test(t)) break;
  }
  if (startLine < 0) return null;

  let endLine = startLine;
  for (let i = startLine + 1; i <= model.getLineCount(); i++) {
    const t = model.getLineContent(i);
    if (!t.trim()) {
      endLine = i;
      continue;
    }
    const ind = (t.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind < entityIndent) break;
    if (ind === entityIndent && /^\s*-\s+\S/.test(t)) break;
    endLine = i;
  }
  return { startLine, endLine, entityIndent };
}

/** min(upIndent, downIndent) для пустой строки */
function cursorIndentForEmpty(model: any, line: number): number {
  let up = -1,
    down = -1;
  for (let n = line - 1; n >= 1; n--) {
    const t = model.getLineContent(n);
    if (!t.trim()) continue;
    up = (t.match(/^(\s*)/) || ["", ""])[1].length;
    break;
  }
  for (let n = line + 1; n <= model.getLineCount(); n++) {
    const t = model.getLineContent(n);
    if (!t.trim()) continue;
    down = (t.match(/^(\s*)/) || ["", ""])[1].length;
    break;
  }
  if (up < 0 && down < 0) return 0;
  if (up < 0) return down;
  if (down < 0) return up;
  return Math.min(up, down);
}

export const entityFieldPickerWidget: WidgetDef = {
  id: "entity-field-picker",
  title: "Поля сущности",
  priority: 70,
  getActions(ctx) {
    if (ctx.section !== "entities") return [];
    if (!ctx.entity) return [];

    const lineText = ctx.model.getLineContent(ctx.currentLine);
    const isEntityId = /^\s*-\s+id\s*:/.test(lineText);
    const isEmpty = lineText.trim() === "";

    const block = findEntityBlock(ctx.model, ctx.currentLine);
    if (!block) return [];

    if (isEmpty) {
      // Пустая строка: считаем отступ, проверяем, что это уровень полей entity
      const ci = cursorIndentForEmpty(ctx.model, ctx.currentLine);
      if (ci !== block.entityIndent + 2) return [];

      // Пустая строка перед следующей сущностью — не наш случай
      for (let n = ctx.currentLine + 1; n <= ctx.model.getLineCount(); n++) {
        const t = ctx.model.getLineContent(n);
        if (!t.trim()) continue;
        const m = t.match(/^(\s*)-\s+id\s*:/);
        if (m && m[1].length === block.entityIndent) return [];
        break;
      }
    } else if (!isEntityId) {
      return [];
    }

    // Какие поля уже есть
    const present = new Set<string>();
    for (let i = block.startLine + 1; i <= block.endLine; i++) {
      const t = ctx.model.getLineContent(i);
      if (!t.trim()) continue;
      const ind = (t.match(/^(\s*)/) || ["", ""])[1].length;
      if (ind === block.entityIndent + 2) {
        const m = t.match(/^\s*([a-zA-Z_][\w]*)\s*:/);
        if (m) present.add(m[1]);
      }
    }

    const missing = ENTITY_FIELDS.filter((f) => !present.has(f.name));
    if (missing.length === 0) return [];

    const indent = " ".repeat(block.entityIndent + 2);

    return missing.map((f) => ({
      id: "ef-" + f.name,
      label: f.label,
      icon: f.icon,
      hint: `Добавить ${f.name} в сущность`,
      run: (_c: WidgetContext, ed: any, m: any) => {
        insertRawAt(ed, m, block.endLine, indent, f.snippet);
      },
    }));
  },
};
