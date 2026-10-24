import type { GeneratedBlock } from "../../../core/analyzer/schema-generator/types";
import type { LineMap } from "./line-map";

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

export function planEdits(
  content: string,
  blocks: GeneratedBlock[],
  yamlByBlock: Record<string, string>,
  lineMap: LineMap,
): MonacoEdit[] {
  const lines = content.split("\n");
  const edits: MonacoEdit[] = [];

  const bySection = new Map<string, GeneratedBlock[]>();
  for (const b of blocks) {
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
  const endLine1Based = Math.min(
    section.line + section.linesCount,
    lines.length,
  );
  const insertLine = Math.max(1, Math.min(endLine1Based, lines.length));
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
