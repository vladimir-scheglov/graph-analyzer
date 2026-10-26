import type { GeneratedBlock } from "../../../core/analyzer/schema-generator/types";
import { mergeViewTree } from "../../../core/analyzer/schema-generator/util-merge-views";
import type { LineMap } from "./line-map";
import {
  extractExistingIds,
  findBlockRange,
  findViewInsertPoints,
} from "./view-insert";
import type { ManifestBlockStatus } from "../../../core/analyzer/schema-generator/types";

export interface MonacoEdit {
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  text: string;
}

/**
 * YAML-объект (`id: x\nname: y`) → элемент массива (`  - id: x\n    name: y`).
 * Первая строка получает `- `, остальные — отступ + 2.
 */
function toArrayItem(yamlObj: string, indent: string): string {
  const lines = yamlObj.replace(/\n+$/, "").split("\n");
  if (lines.length === 0 || !lines[0]) return "";
  return lines
    .map((l, i) => (i === 0 ? `${indent}- ${l}` : `${indent}  ${l}`))
    .join("\n");
}

function emitYaml(payload: any): string {
  const yaml = require("js-yaml");
  return yaml.dump(payload, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
}

function planEditsIntoExistingView(
  content: string,
  viewId: string,
  merged: { widgets: any[]; groups: any[]; views: any[] },
): MonacoEdit[] {
  const points = findViewInsertPoints(content, viewId);
  const lines = content.split("\n");
  const edits: MonacoEdit[] = [];
  
  for (const point of points) {
    const items = (merged as any)[point.section] as any[] | undefined;
    if (!items || items.length === 0) continue;

    // ── дедупликация по фактическому содержимому Monaco ──
    const existingIds = extractExistingIds(content, viewId, point.section);
    const newItems = items.filter(
      (it: any) => it?.id && !existingIds.has(it.id),
    );
    if (newItems.length === 0) continue;

    // пустая секция `[]` — заменяем
    if (point.inlineEmptyLine != null) {
      const lineText = lines[point.inlineEmptyLine - 1] || "";
      const containerIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;
      const dashIndent = " ".repeat(containerIndent + 2);
      const itemsText = newItems
        .map((it) => toArrayItem(emitYaml(it), dashIndent))
        .join("\n");
      edits.push({
        range: {
          startLineNumber: point.inlineEmptyLine,
          startColumn: 1,
          endLineNumber: point.inlineEmptyLine,
          endColumn: lineText.length + 1,
        },
        text: `${" ".repeat(containerIndent)}${point.section}:\n${itemsText}`,
      });
      continue;
    }

    const dashIndent = " ".repeat(point.dashIndent ?? point.viewOpenIndent + 4);
    const itemsText = newItems
      .map((it) => toArrayItem(emitYaml(it), dashIndent))
      .join("\n");

    if (point.exists && point.insertAfterLine != null) {
      const insertLine = point.insertAfterLine;
      const lineText = lines[insertLine - 1] || "";
      edits.push({
        range: {
          startLineNumber: insertLine,
          startColumn: lineText.length + 1,
          endLineNumber: insertLine,
          endColumn: lineText.length + 1,
        },
        text: "\n" + itemsText,
      });
    } else {
      const containerIndent = " ".repeat(point.viewOpenIndent + 2);
      const block = `\n${containerIndent}${point.section}:\n${itemsText}`;
      const openLineText = lines[point.viewOpenLine - 1] || "";
      edits.push({
        range: {
          startLineNumber: point.viewOpenLine,
          startColumn: openLineText.length + 1,
          endLineNumber: point.viewOpenLine,
          endColumn: openLineText.length + 1,
        },
        text: block,
      });
    }
  }

  return edits;
}

function replaceBlockInYaml(
  content: string,
  block: GeneratedBlock,
  newYaml: string,
): MonacoEdit | null {
  const range = findBlockRange(content, block.blockId, block.parentViewId);
  if (!range) return null;
  const lines = content.split("\n");
  const dashIndent = " ".repeat(range.indent);
  const newText = toArrayItem(newYaml, dashIndent);
  return {
    range: {
      startLineNumber: range.startLine,
      startColumn: 1,
      endLineNumber: range.endLine,
      endColumn: (lines[range.endLine - 1] || "").length + 1,
    },
    text: newText,
  };
}

export function planEdits(
  content: string,
  blocks: GeneratedBlock[],
  yamlByBlock: Record<string, string>,
  lineMap: LineMap,
  manifestStatus?: Record<string, ManifestBlockStatus>,
  replaceModified = false,
  restoreOrphanedIds?: string[],
): MonacoEdit[] {
  const status = manifestStatus ?? {};
  const restore = new Set(restoreOrphanedIds ?? []);
  const edits: MonacoEdit[] = [];

  const viewRootIdsNew = new Set<string>();
  const viewRootIdsOrphaned = new Set<string>();
  for (const b of blocks) {
    if (b.section !== "views" || b.parentViewId) continue;
    const st = status[b.blockId];
    if (st === "new" || st == null) viewRootIdsNew.add(b.payload?.id);
    if (st === "orphaned" && restore.has(b.blockId))
      viewRootIdsOrphaned.add(b.payload?.id);
  }

  const appendBlocks: GeneratedBlock[] = [];
  const replaceBlocks: GeneratedBlock[] = [];

  for (const b of blocks) {
    const st = status[b.blockId];
    if (st === "unchanged") continue;
    if (st === "orphaned" && !restore.has(b.blockId)) continue;
    if (st === "modified" && !replaceModified) continue;

    if (
      b.parentViewId &&
      (viewRootIdsNew.has(b.parentViewId) ||
        viewRootIdsOrphaned.has(b.parentViewId))
    ) {
      appendBlocks.push(b);
      continue;
    }
    if (st === "outdated" || st === "modified") replaceBlocks.push(b);
    else appendBlocks.push(b);
  }

  // ── 2. Replace для outdated ──
  for (const b of replaceBlocks) {
    const yaml = yamlByBlock[b.blockId];
    if (!yaml) continue;
    const edit = replaceBlockInYaml(content, b, yaml);
    if (edit) edits.push(edit);
  }

  // ── 3. Append (существующая логика) ──
  const lines = content.split("\n");
  const viewsSection = lineMap.sections.find((s) => s.key === "views");
  const existingViewIds = new Set(viewsSection?.nodes.map((n) => n.id) || []);

  const viewsByParent = new Map<string, GeneratedBlock[]>();
  const allViewIds = new Set<string>();
  const viewRootsById = new Map<string, GeneratedBlock>();

  for (const b of appendBlocks) {
    if (b.section !== "views") continue;
    if (!b.parentViewId) {
      allViewIds.add(b.payload?.id);
      viewRootsById.set(b.payload?.id, b);
      continue;
    }
    allViewIds.add(b.parentViewId);
    if (!viewsByParent.has(b.parentViewId))
      viewsByParent.set(b.parentViewId, []);
    viewsByParent.get(b.parentViewId)!.push(b);
  }

  // Все новые root-view (не existing) собираем в один вызов planSectionAppend.
  // Иначе два root-view дают два edit'а на одну позицию — Monaco executeEdits
  // теряет один из них (баг: 1939:39 × 2).
  const newMergedRoots: GeneratedBlock[] = [];
  const newMergedYaml: Record<string, string> = {};

  for (const viewId of allViewIds) {
    if (!viewId) continue;
    const children = viewsByParent.get(viewId) || [];
    const root = viewRootsById.get(viewId);

    if (existingViewIds.has(viewId)) {
      // существующий root-view → аппендим недостающих children внутрь
      if (children.length === 0) continue;
      const merged = {
        widgets: [] as any[],
        groups: [] as any[],
        views: [] as any[],
      };
      for (const child of children) {
        const kind = child.blockId.split(":")[0];
        if (kind === "widget") merged.widgets.push(child.payload);
        else if (kind === "group") merged.groups.push(child.payload);
        else if (kind === "view") merged.views.push(child.payload);
      }
      if (
        merged.widgets.length + merged.groups.length + merged.views.length ===
        0
      )
        continue;
      edits.push(...planEditsIntoExistingView(content, viewId, merged));
    } else if (root) {
      // новый root-view → в общий батч
      const merged = mergeViewTree(root, children);
      newMergedRoots.push(merged);
      newMergedYaml[merged.blockId] = emitYaml(merged.payload);
    }
  }

  // ОДИН edit на всю секцию views — все новые root-view подряд
  if (newMergedRoots.length > 0) {
    const edit = planSectionAppend(
      lines,
      lineMap,
      "views",
      newMergedRoots,
      newMergedYaml,
    );
    if (edit) edits.push(edit);
  }

  // ── 4. Остальные секции ──
  const bySection = new Map<string, GeneratedBlock[]>();
  for (const b of appendBlocks) {
    if (b.section === "views") continue;
    if (!bySection.has(b.section)) bySection.set(b.section, []);
    bySection.get(b.section)!.push(b);
  }
  for (const [sectionKey, sectionBlocks] of bySection) {
    if (sectionKey === "menus") {
      edits.push(...planMenuEdits(lines, sectionBlocks, yamlByBlock));
      continue;
    }
    const edit = planSectionAppend(
      lines,
      lineMap,
      sectionKey,
      sectionBlocks,
      yamlByBlock,
    );
    if (edit) edits.push(edit);
  }

  return edits;
}

function planSectionAppend(
  lines: string[],
  lineMap: LineMap,
  sectionKey: string,
  blocks: GeneratedBlock[],
  yamlByBlock: Record<string, string>,
): MonacoEdit | null {
  const itemsText = blocks
    .map((b) => toArrayItem(yamlByBlock[b.blockId] || "", "  "))
    .filter(Boolean)
    .join("\n");
  if (!itemsText) return null;

  const section = lineMap.sections.find((s) => s.key === sectionKey);

  // ===== 1. Секции нет — в конец файла =====
  if (!section) {
    const last = lines.length;
    const col = (lines[last - 1] || "").length + 1;
    return {
      range: {
        startLineNumber: last,
        startColumn: col,
        endLineNumber: last,
        endColumn: col,
      },
      text: `\n${sectionKey}:\n${itemsText}`,
    };
  }

  // ===== 2. Секция пустая (`section: []` или `section:`) — replace строки =====
  if (section.count === 0) {
    const lineIdx = section.line - 1;
    const line = lines[lineIdx] || "";
    const m = line.match(new RegExp(`^(\\s*)${sectionKey}:\\s*(\\[\\])?\\s*$`));
    if (m) {
      const indent = m[1];
      return {
        range: {
          startLineNumber: section.line,
          startColumn: 1,
          endLineNumber: section.line,
          endColumn: line.length + 1,
        },
        text: `${indent}${sectionKey}:\n${itemsText}`,
      };
    }
    // fallback — в конец файла (на случай, если lineMap солгал)
    const last = lines.length;
    const col = (lines[last - 1] || "").length + 1;
    return {
      range: {
        startLineNumber: last,
        startColumn: col,
        endLineNumber: last,
        endColumn: col,
      },
      text: `\n${sectionKey}:\n${itemsText}`,
    };
  }

  // ===== 3. Секция непустая — вставка в конец секции =====
  // section.line — 1-based, section.linesCount = end - start, где end — 0-based
  // индекс следующего заголовка. Значит section.line + section.linesCount — 1-based
  // строка СЛЕДУЮЩЕЙ секции. Нам нужна последняя строка ТЕКУЩЕЙ, поэтому -1.
  let insertLine = Math.min(
    section.line + section.linesCount - 1,
    lines.length,
  );
  // Пропускаем пустые строки между секциями — вставляем в последнюю непустую
  // строку секции (или в конец файла, если секция последняя и файл с трейлинг \n)
  while (insertLine > section.line && !(lines[insertLine - 1] || "").trim()) {
    insertLine--;
  }
  const lineText = lines[insertLine - 1] || "";
  return {
    range: {
      startLineNumber: insertLine,
      startColumn: lineText.length + 1,
      endLineNumber: insertLine,
      endColumn: lineText.length + 1,
    },
    text: "\n" + itemsText,
  };
}

function planMenuEdits(
  lines: string[],
  blocks: GeneratedBlock[],
  yamlByBlock: Record<string, string>,
): MonacoEdit[] {
  const byRoot = new Map<string, GeneratedBlock[]>();
  for (const b of blocks) {
    const rootId = b.menuRootId;
    if (!rootId) continue;
    if (!byRoot.has(rootId)) byRoot.set(rootId, []);
    byRoot.get(rootId)!.push(b);
  }
  const edits: MonacoEdit[] = [];
  for (const [rootId, rootBlocks] of byRoot) {
    const edit = planMenuRootInsert(lines, rootId, rootBlocks, yamlByBlock);
    if (edit) edits.push(edit);
  }
  return edits;
}

function planMenuRootInsert(
  lines: string[],
  rootId: string,
  blocks: GeneratedBlock[],
  yamlByBlock: Record<string, string>,
): MonacoEdit | null {
  // ===== Ищем `- id: <rootId>` в menus =====
  let rootLineIdx = -1;
  let rootIndent = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)-\s+id:\s*([^\s#]+)/);
    if (m && m[2].replace(/["']/g, "") === rootId) {
      rootLineIdx = i;
      rootIndent = m[1].length;
      break;
    }
  }
  if (rootLineIdx < 0) return null;

  // ===== Границы root_group =====
  let rootEnd = lines.length;
  for (let i = rootLineIdx + 1; i < lines.length; i++) {
    const ind = (lines[i].match(/^(\s*)/) || ["", ""])[1].length;
    if (ind === 0) {
      rootEnd = i;
      break;
    }
    const dash = lines[i].match(/^(\s*)-\s+id:/);
    if (dash && dash[1].length === rootIndent) {
      rootEnd = i;
      break;
    }
  }

  // ===== Ищем `items:` внутри root_group =====
  let itemsLineIdx = -1;
  let itemsIndent = -1;
  let itemsIsEmpty = false;
  for (let i = rootLineIdx + 1; i < rootEnd; i++) {
    const m = lines[i].match(/^(\s*)items:\s*(\[\])?\s*$/);
    if (!m) continue;
    itemsLineIdx = i;
    itemsIndent = m[1].length;
    itemsIsEmpty = !!m[2];

    if (!itemsIsEmpty && i + 1 < rootEnd) {
      const nextInd = (lines[i + 1].match(/^(\s*)/) || ["", ""])[1].length;
      if (nextInd > itemsIndent) itemsIsEmpty = false;
      else itemsIsEmpty = true;
    } else if (i + 1 >= rootEnd) {
      itemsIsEmpty = true;
    }
    break;
  }

  const itemIndent = " ".repeat(
    (itemsIndent >= 0 ? itemsIndent : rootIndent + 2) + 2,
  );
  const itemsText = blocks
    .map((b) => toArrayItem(yamlByBlock[b.blockId] || "", itemIndent))
    .filter(Boolean)
    .join("\n");
  if (!itemsText) return null;

  // ===== items отсутствует — вставляем после `- id: rootId` =====
  if (itemsLineIdx < 0) {
    const lineText = lines[rootLineIdx];
    return {
      range: {
        startLineNumber: rootLineIdx + 1,
        startColumn: lineText.length + 1,
        endLineNumber: rootLineIdx + 1,
        endColumn: lineText.length + 1,
      },
      text: `\n${" ".repeat(rootIndent + 2)}items:\n${itemsText}`,
    };
  }

  // ===== items: [] — replace =====
  if (itemsIsEmpty) {
    const lineText = lines[itemsLineIdx];
    return {
      range: {
        startLineNumber: itemsLineIdx + 1,
        startColumn: 1,
        endLineNumber: itemsLineIdx + 1,
        endColumn: lineText.length + 1,
      },
      text: `${" ".repeat(itemsIndent)}items:\n${itemsText}`,
    };
  }

  // ===== items непустой — вставляем в конец items =====
  let insertBefore = rootEnd;
  for (let i = itemsLineIdx + 1; i < rootEnd; i++) {
    const ind = (lines[i].match(/^(\s*)/) || ["", ""])[1].length;
    if (ind <= itemsIndent) {
      insertBefore = i;
      break;
    }
  }
  const insertAfter = Math.max(itemsLineIdx, insertBefore - 1);
  const lineText = lines[insertAfter] || "";
  return {
    range: {
      startLineNumber: insertAfter + 1,
      startColumn: lineText.length + 1,
      endLineNumber: insertAfter + 1,
      endColumn: lineText.length + 1,
    },
    text: "\n" + itemsText,
  };
}
