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

function findEntityBlockBounds(
  lines: string[],
  entityId: string,
): { start: number; end: number; indent: number } | null {
  let entitiesStart = -1;
  let entitiesEnd = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind === 0 && /^entities\s*:\s*$/.test(line)) {
      entitiesStart = i;
      for (let j = i + 1; j < lines.length; j++) {
        const lj = lines[j];
        if (!lj.trim()) continue;
        const inj = (lj.match(/^(\s*)/) || ["", ""])[1].length;
        if (inj === 0) {
          entitiesEnd = j;
          break;
        }
      }
      break;
    }
  }
  if (entitiesStart < 0) return null;

  let itemIndent = -1;
  for (let i = entitiesStart + 1; i < entitiesEnd; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const m = line.match(/^(\s*)-\s+\S/);
    if (m) {
      itemIndent = m[1].length;
      break;
    }
  }
  if (itemIndent < 0) return null;

  const idRegex = /^(\s*)-\s+id\s*:\s*["']?([^\s"'#]+)["']?/;
  let itemStart = -1;
  for (let i = entitiesStart + 1; i < entitiesEnd; i++) {
    const m = lines[i].match(idRegex);
    if (m && m[1].length === itemIndent && m[2] === entityId) {
      itemStart = i;
      break;
    }
  }
  if (itemStart < 0) return null;

  let itemEnd = entitiesEnd;
  for (let i = itemStart + 1; i < entitiesEnd; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind < itemIndent) {
      itemEnd = i;
      break;
    }
    const m = line.match(/^(\s*)-\s+\S/);
    if (m && m[1].length === itemIndent) {
      itemEnd = i;
      break;
    }
  }

  return { start: itemStart, end: itemEnd, indent: itemIndent };
}

function dumpAsArrayItem(value: any, indent: string): string {
  const yaml = require("js-yaml");
  const dumped = yaml
    .dump([value], { indent: 2, lineWidth: 120, noRefs: true, sortKeys: false })
    .replace(/\n+$/, "");
  return dumped
    .split("\n")
    .map((l) => indent + l)
    .join("\n");
}

function planEntityEnrichment(
  lines: string[],
  blocks: GeneratedBlock[],
): MonacoEdit[] {
  const edits: MonacoEdit[] = [];

  for (const b of blocks) {
    const E = b.payload?.id;
    if (!E) continue;
    const bounds = findEntityBlockBounds(lines, E);
    if (!bounds) continue;

    const fieldIndent = " ".repeat(bounds.indent + 2);
    let hasSorting = false;
    let hasSearching = false;
    for (let i = bounds.start + 1; i < bounds.end; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
      if (ind !== bounds.indent + 2) continue;
      const trimmed = line.trim();
      if (/^sorting\s*:/.test(trimmed)) hasSorting = true;
      if (/^searching\s*:/.test(trimmed)) hasSearching = true;
    }

    const parts: string[] = [];
    if (b.payload.sorting && !hasSorting) {
      parts.push(`${fieldIndent}sorting:`);
      for (const s of b.payload.sorting) {
        parts.push(dumpAsArrayItem(s, fieldIndent + "  "));
      }
    }
    if (b.payload.searching && !hasSearching) {
      parts.push(`${fieldIndent}searching:`);
      for (const s of b.payload.searching) {
        parts.push(dumpAsArrayItem(s, fieldIndent + "  "));
      }
    }
    if (parts.length === 0) continue;

    let insertAfter = bounds.end - 1;
    while (insertAfter > bounds.start && !(lines[insertAfter] || "").trim()) {
      insertAfter--;
    }
    const insertLine = insertAfter + 1;
    const lineText = lines[insertAfter] || "";
    edits.push({
      range: {
        startLineNumber: insertLine,
        startColumn: lineText.length + 1,
        endLineNumber: insertLine,
        endColumn: lineText.length + 1,
      },
      text: "\n" + parts.join("\n"),
    });
  }

  return edits;
}

export function planEdits(
  content: string,
  blocks: GeneratedBlock[],
  yamlByBlock: Record<string, string>,
  lineMap: LineMap,
  manifestStatus?: Record<string, ManifestBlockStatus>,
  replaceModified = false,
  restoreOrphanedIds?: string[],
  forceReplaceIds?: string[],
): MonacoEdit[] {
  const status = manifestStatus ?? {};
  const restore = new Set(restoreOrphanedIds ?? []);
  const forceReplace = new Set(forceReplaceIds ?? []);
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

    const isForce = forceReplace.has(b.blockId);
    if (st === "modified" && !replaceModified && !isForce) continue;

    if (
      b.parentViewId &&
      (viewRootIdsNew.has(b.parentViewId) ||
        viewRootIdsOrphaned.has(b.parentViewId))
    ) {
      appendBlocks.push(b);
      continue;
    }

    if (st === "outdated" || st === "modified" || (isForce && st !== "new")) {
      replaceBlocks.push(b);
    } else {
      appendBlocks.push(b);
    }
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
    if (sectionKey === "exchangeSettings") {
      edits.push(
        ...planExchangeSettingsEdit(lines, sectionBlocks, yamlByBlock),
      );
      continue;
    }
    if (sectionKey === "columns") {
      edits.push(...planColumnAppend(lines, sectionBlocks, yamlByBlock));
      continue;
    }
    if (sectionKey === "entities") {
      edits.push(...planEntityEnrichment(lines, sectionBlocks));
      continue;
    }
    if (sectionKey === "menus") {
      const nested = sectionBlocks.filter((b) => !!b.menuRootId);
      const topLevel = sectionBlocks.filter((b) => !b.menuRootId);

      // Merge items into new roots (когда root и items создаются одним apply)
      const newRootIds = new Set<string>();
      for (const b of topLevel) {
        if (status[b.blockId] === "new" || status[b.blockId] == null) {
          const rid = b.payload?.id;
          if (rid) newRootIds.add(rid);
        }
      }
      const consumedItemIds = new Set<string>();
      for (const b of topLevel) {
        const rid = b.payload?.id;
        if (!rid || !newRootIds.has(rid)) continue;
        const items = nested.filter((it) => it.menuRootId === rid);
        if (items.length === 0) continue;
        b.payload = {
          ...b.payload,
          items: [...(b.payload.items || []), ...items.map((it) => it.payload)],
        };
        for (const it of items) consumedItemIds.add(it.blockId);
        yamlByBlock[b.blockId] = emitYaml(b.payload);
      }

      const remainingNested = nested.filter(
        (b) => !consumedItemIds.has(b.blockId),
      );
      if (remainingNested.length > 0) {
        edits.push(...planMenuEdits(lines, remainingNested, yamlByBlock));
      }
      if (topLevel.length > 0) {
        const edit = planSectionAppend(
          lines,
          lineMap,
          "menus",
          topLevel,
          yamlByBlock,
        );
        if (edit) edits.push(edit);
      }
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

function findTableColumnsInsertPoint(
  content: string,
  viewId: string,
): { insertLine: number; dashIndent: number } | null {
  const lines = content.split("\n");
  let viewsStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^views\s*:\s*$/.test(lines[i])) {
      viewsStart = i;
      break;
    }
  }
  if (viewsStart < 0) return null;

  const idRegex = /^(\s*)-\s+id\s*:\s*["']?([^\s"'#]+)["']?\s*(?:#.*)?$/;
  let viewStart = -1;
  let viewEnd = lines.length;
  let firstItemIndent = -1;
  for (let i = viewsStart + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind === 0) {
      viewEnd = i;
      break;
    }
    const m = line.match(idRegex);
    if (!m) continue;
    if (firstItemIndent < 0) firstItemIndent = m[1].length;
    if (viewStart < 0) {
      if (m[2] === viewId) viewStart = i;
    } else if (m[1].length === firstItemIndent) {
      viewEnd = i;
      break;
    }
  }
  if (viewStart < 0) return null;

  let tableLine = -1;
  let tableIndent = -1;
  for (let i = viewStart + 1; i < viewEnd; i++) {
    const m = lines[i].match(/^(\s*)table\s*:\s*$/);
    if (m) {
      tableLine = i;
      tableIndent = m[1].length;
      break;
    }
  }
  if (tableLine < 0) return null;

  let columnsLine = -1;
  let columnsIndent = -1;
  for (let i = tableLine + 1; i < viewEnd; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind <= tableIndent) break;
    const m = line.match(/^(\s*)columns\s*:\s*$/);
    if (m) {
      columnsLine = i;
      columnsIndent = m[1].length;
      break;
    }
  }
  if (columnsLine < 0) return null;

  const dashIndent = columnsIndent + 2;
  let lastItemEnd = columnsLine + 1;
  for (let i = columnsLine + 1; i < viewEnd; i++) {
    const line = lines[i];
    if (!line.trim()) {
      lastItemEnd = i + 1;
      continue;
    }
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind <= columnsIndent) break;
    if (ind === dashIndent && /^\s*-\s+\S/.test(line)) {
      lastItemEnd = i + 1;
      for (let j = i + 1; j < viewEnd; j++) {
        const lj = lines[j];
        if (!lj.trim()) {
          lastItemEnd = j + 1;
          continue;
        }
        const inj = (lj.match(/^(\s*)/) || ["", ""])[1].length;
        if (inj < dashIndent) break;
        if (inj === dashIndent && /^\s*-\s+\S/.test(lj)) break;
        lastItemEnd = j + 1;
      }
    }
  }

  return { insertLine: lastItemEnd, dashIndent };
}

function planColumnAppend(
  lines: string[],
  blocks: GeneratedBlock[],
  yamlByBlock: Record<string, string>,
): MonacoEdit[] {
  const byView = new Map<string, GeneratedBlock[]>();
  for (const b of blocks) {
    if (!b.parentViewId) continue;
    if (!byView.has(b.parentViewId)) byView.set(b.parentViewId, []);
    byView.get(b.parentViewId)!.push(b);
  }
  const edits: MonacoEdit[] = [];
  for (const [viewId, viewBlocks] of byView) {
    const content = lines.join("\n");
    const point = findTableColumnsInsertPoint(content, viewId);
    if (!point) continue;

    const dashIndent = " ".repeat(point.dashIndent);
    const itemsText = viewBlocks
      .map((b) => toArrayItem(yamlByBlock[b.blockId] || "", dashIndent))
      .filter(Boolean)
      .join("\n");
    if (!itemsText) continue;

    let insertLine = point.insertLine;
    while (insertLine > 1 && !(lines[insertLine - 1] || "").trim()) {
      insertLine--;
    }
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
  }
  return edits;
}

function indentBy(yaml: string, indent: string): string {
  return yaml
    .replace(/\n+$/, "")
    .split("\n")
    .map((l) => (l ? indent + l : l))
    .join("\n");
}

function planExchangeSettingsEdit(
  lines: string[],
  blocks: GeneratedBlock[],
  yamlByBlock: Record<string, string>,
): MonacoEdit[] {
  const block = blocks.find((b) => !!yamlByBlock[b.blockId]);
  if (!block) return [];
  const yaml = yamlByBlock[block.blockId];
  if (!yaml) return [];

  // Найти существующий top-level `exchangeSettings:`
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^exchangeSettings\s*:/.test(lines[i])) {
      start = i;
      break;
    }
  }

  if (start < 0) {
    const last = lines.length;
    const col = (lines[last - 1] || "").length + 1;
    return [
      {
        range: {
          startLineNumber: last,
          startColumn: col,
          endLineNumber: last,
          endColumn: col,
        },
        text: `\nexchangeSettings:\n${indentBy(yaml, "  ")}`,
      },
    ];
  }

  // Заменить всю секцию до следующего top-level ключа
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind === 0 && !line.trim().startsWith("#")) {
      end = i;
      break;
    }
  }
  const lastLine = end - 1;
  const lastLineText = lines[lastLine] || "";
  return [
    {
      range: {
        startLineNumber: start + 1,
        startColumn: 1,
        endLineNumber: lastLine + 1,
        endColumn: lastLineText.length + 1,
      },
      text: `exchangeSettings:\n${indentBy(yaml, "  ")}`,
    },
  ];
}