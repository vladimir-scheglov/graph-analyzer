import type { GeneratedBlock } from "./types";
import { cloneDeep } from "./util-clone";

function pushUnique(arr: any[], item: any): void {
  if (!item || typeof item !== "object") return;
  const id = item.id;
  if (!id) {
    arr.push(item);
    return;
  }
  if (arr.some((x) => x && x.id === id)) return;
  arr.push(item);
}

/**
 * Собирает top-level view в полный payload, вкладывая в него дочерние
 * блоки (widget/group/view) в соответствующие массивы.
 *
 * Используется:
 *  - в `index.ts:generateForEntity` — для `yamlByBlock[rootBlockId]`;
 *  - в `apply-generation.ts:planEdits` — для формирования edit'а.
 */
export function mergeViewTree(
  rootBlock: GeneratedBlock,
  children: GeneratedBlock[],
): GeneratedBlock {
  const merged = cloneDeep(rootBlock);
  const payload = merged.payload;

  if (payload.type !== "entity") {
    return merged;
  }

  const widgets = children.filter((c) => c.blockId.startsWith("widget:"));
  const groups = children.filter((c) => c.blockId.startsWith("group:"));
  const nested = children.filter((c) => c.blockId.startsWith("view:"));

  if (widgets.length > 0 || Array.isArray(payload.widgets)) {
    if (!Array.isArray(payload.widgets)) payload.widgets = [];
    for (const w of widgets) pushUnique(payload.widgets, w.payload);
  }
  if (groups.length > 0 || Array.isArray(payload.groups)) {
    if (!Array.isArray(payload.groups)) payload.groups = [];
    for (const g of groups) pushUnique(payload.groups, g.payload);
  }
  if (nested.length > 0 || Array.isArray(payload.views)) {
    if (!Array.isArray(payload.views)) payload.views = [];
    for (const v of nested) pushUnique(payload.views, v.payload);
  }

  return merged;
}