import { insertRawAt } from "../insert";
import type { WidgetContext, WidgetDef } from "../types";

function isViewInMenu(model: any, viewId: string): boolean {
  const lineCount = model.getLineCount();
  let inMenus = false;
  for (let i = 1; i <= lineCount; i++) {
    const t = model.getLineContent(i);
    if (!t.trim()) continue;
    const ind = t.match(/^(\s*)/)?.[1].length || 0;
    if (ind === 0) {
      inMenus = /^menus\s*:/.test(t);
      continue;
    }
    if (!inMenus) continue;
    const m = t.match(/^\s*(?:-\s+)?view\s*:\s*["']?([^\s"'#]+)["']?/);
    if (m && m[1] === viewId) return true;
  }
  return false;
}

function findRootGroup(
  model: any,
): { id: string; lastItemLine: number } | null {
  const lineCount = model.getLineCount();
  let inMenus = false;
  let rootId: string | null = null;
  let rootIndent = -1;
  let rootEnd = -1;
  let rootStartLine = -1;

  for (let i = 1; i <= lineCount; i++) {
    const t = model.getLineContent(i);
    const ind = t.match(/^(\s*)/)?.[1].length || 0;
    if (ind === 0) {
      inMenus = /^menus\s*:/.test(t);
      continue;
    }
    if (!inMenus) continue;
    const m = t.match(/^(\s*)-\s+id:\s*["']?([^\s"'#]+)["']?/);
    if (!m) continue;
    if (rootStartLine < 0) {
      rootStartLine = i;
      rootId = m[2];
      rootIndent = m[1].length;
    } else if (m[1].length === rootIndent) {
      rootEnd = i - 1;
      break;
    }
  }
  if (!rootId || rootStartLine < 0) return null;
  if (rootEnd < 0) rootEnd = lineCount;

  let itemsLine = -1;
  let itemsIndent = -1;
  for (let i = rootStartLine + 1; i <= rootEnd; i++) {
    const t = model.getLineContent(i);
    const ind = t.match(/^(\s*)/)?.[1].length || 0;
    if (ind <= rootIndent) break;
    const m = t.match(/^(\s*)items\s*:/);
    if (m) {
      itemsLine = i;
      itemsIndent = m[1].length;
      break;
    }
  }
  if (itemsLine < 0) return null;

  let lastLine = itemsLine;
  for (let i = itemsLine + 1; i <= rootEnd; i++) {
    const t = model.getLineContent(i);
    const ind = t.match(/^(\s*)/)?.[1].length || 0;
    if (!t.trim()) {
      lastLine = i;
      continue;
    }
    if (ind <= itemsIndent) break;
    lastLine = i;
  }
  return { id: rootId, lastItemLine: lastLine };
}

export const missingMenuWidget: WidgetDef = {
  id: "missing-menu",
  title: "Не в меню",
  priority: 72,
  getActions(ctx) {
    if (ctx.section !== "views") return [];
    if (ctx.fieldName !== "id") return [];
    const viewId = (ctx.fieldValue || "").trim();
    if (!viewId) return [];

    // Только list / tabs_list
    const blockText = ctx.blockLines
      .map((ln) => ctx.model.getLineContent(ln))
      .join("\n");
    if (!/^\s*type\s*:\s*(list|tabs_list)\s*$/m.test(blockText)) return [];

    if (isViewInMenu(ctx.model, viewId)) return [];

    const root = findRootGroup(ctx.model);
    if (!root) return [];

    return [
      {
        id: "menu-" + root.id,
        label: `+ Привязать к ${root.id}`,
        icon: "menu",
        hint: `Добавит menuItem в ${root.id}.items[]`,
        run: (_c: any, ed: any, m: any) => {
          const menuItemId = "menu_" + viewId.replace(/^(lists_|views_)/, "");
          const route =
            "/" + viewId.replace(/^(lists_|views_)/, "").replace(/_/g, "-");
          const text = [
            "- id: " + menuItemId,
            "  route: " + route,
            "  label: ${1:" + viewId + "}",
            "  type: menu",
            "  view: " + viewId,
          ].join("\n");
          const indent = " ".repeat(
            ctx.model.getLineContent(root.lastItemLine).match(/^(\s*)/)?.[1]
              .length || 0,
          );
          insertRawAt(ed, m, root.lastItemLine, indent, text);
        },
      },
    ];
  },
};
