/**
 * Находит точки вставки для вложенных items внутрь существующего viewX.
 * Возвращает по одной точке на каждый из widgets / groups / views.
 *
 * Не использует общий lineMap: тот не сохраняет имя контейнера
 * (widgets / groups / views) для children. Здесь — свой локальный парсер.
 */
export interface ViewInsertPoint {
  section: "widgets" | "groups" | "views";
  exists: boolean;
  insertAfterLine?: number;
  dashIndent?: number;
  inlineEmptyLine?: number;
  viewOpenLine: number;
  viewOpenIndent: number;
  /** 1-based строка с `widgets:` / `groups:` / `views:` */
  containerStartLine?: number;
  /** 1-based exclusive — где секция заканчивается */
  containerEndLine?: number;
}

export function findViewInsertPoints(
  content: string,
  viewId: string,
): ViewInsertPoint[] {
  const lines = content.split("\n");

  // 1. Найти секцию views (top-level, indent 0)
  let viewsStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^views\s*:\s*$/.test(lines[i])) {
      viewsStart = i;
      break;
    }
  }
  if (viewsStart < 0) return [];

  // 2. Найти `- id: viewId` (top-level view) и его границы
  let viewOpenLine = -1;
  let viewOpenIndent = -1;
  let viewEnd = lines.length; // 0-based exclusive
  let firstItemIndent = -1;
  for (let i = viewsStart + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind === 0) {
      viewEnd = i;
      break;
    } // следующая top-level секция
    const idMatch = line.match(
      /^(\s*)-\s+id\s*:\s*["']?([^\s"'#]+)["']?\s*(?:#.*)?$/,
    );
    if (!idMatch) continue;
    const thisIndent = idMatch[1].length;
    if (viewOpenLine < 0) {
      firstItemIndent = thisIndent;
      if (idMatch[2] === viewId) {
        viewOpenLine = i + 1; // 1-based
        viewOpenIndent = thisIndent;
      }
    } else if (thisIndent === firstItemIndent) {
      viewEnd = i;
      break;
    }
  }
  if (viewOpenLine < 0) return [];

  // 3. Для каждого из widgets/groups/views — точка вставки
  const found = new Map<string, ViewInsertPoint>();
  for (let i = viewOpenLine; i < viewEnd; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // пустая секция `widgets: []` в одну строку
    const inline = line.match(
      /^(\s*)(widgets|groups|views)\s*:\s*\[\]\s*(?:#.*)?$/,
    );
    if (inline) {
      const section = inline[2] as "widgets" | "groups" | "views";
      if (found.has(section)) continue;
      found.set(section, {
        section,
        exists: false,
        inlineEmptyLine: i + 1,
        viewOpenLine,
        viewOpenIndent,
      });
      continue;
    }

    const m = line.match(/^(\s*)(widgets|groups|views)\s*:\s*(?:#.*)?$/);
    if (!m) continue;
    const section = m[2] as "widgets" | "groups" | "views";
    if (found.has(section)) continue;

    const containerIndent = m[1].length;
    const dashIndent = containerIndent + 2;

    // Ищем внутри — `- id:` на dashIndent и конец последнего item.
    // insertAfterLine — строка после последнего item (1-based).
    let lastItemEnd = -1; // 0-based exclusive
    for (let j = i + 1; j < viewEnd; j++) {
      const l2 = lines[j];
      if (!l2.trim()) {
        if (lastItemEnd < 0) continue;
        else continue;
      }
      const ind2 = (l2.match(/^(\s*)/) || ["", ""])[1].length;
      if (ind2 <= containerIndent) break;
      const dash = l2.match(/^(\s*)-\s+\S/);
      if (dash && ind2 === dashIndent) {
        // конец этого item = следующая строка с indent <= dashIndent,
        // либо следующий `- ` на dashIndent
        let k = j + 1;
        for (; k < viewEnd; k++) {
          const l3 = lines[k];
          if (!l3.trim()) {
            k++;
            continue;
          }
          const ind3 = (l3.match(/^(\s*)/) || ["", ""])[1].length;
          if (ind3 < dashIndent) break;
          const dash3 = l3.match(/^(\s*)-\s+\S/);
          if (dash3 && ind3 === dashIndent) break;
        }
        lastItemEnd = k;
      }
    }
    found.set(section, {
      section,
      exists: true,
      insertAfterLine: lastItemEnd > 0 ? lastItemEnd : i + 1,
      dashIndent,
      viewOpenLine,
      viewOpenIndent,
      containerStartLine: i + 1,
      containerEndLine: viewEnd, // 0-based exclusive, превращается в 1-based ниже
    });
  }

  // 4. Для отсутствующих секций — точка exists: false
  for (const sec of ["widgets", "groups", "views"] as const) {
    if (!found.has(sec)) {
      found.set(sec, {
        section: sec,
        exists: false,
        viewOpenLine,
        viewOpenIndent,
      });
    }
  }

  return Array.from(found.values());
}

// ── Ниже существующих findViewInsertPoints ──

export interface Range1BasedInclusive {
  startLine: number;
  endLine: number;
  indent: number;
}

function indentOf(line: string): number {
  return (line.match(/^(\s*)/) || ["", ""])[1].length;
}

/** Top-level секция YAML по имени (`actions:`, `views:`, ...). */
function findTopSectionRange(
  content: string,
  sectionName: string,
): Range1BasedInclusive | null {
  const lines = content.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (indentOf(lines[i]) !== 0) continue;
    const m = lines[i].match(/^([a-zA-Z_][\w]*)\s*:\s*(?:#.*)?$/);
    if (m && m[1] === sectionName) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  let end = lines.length;
  for (let j = start + 1; j < lines.length; j++) {
    if (
      indentOf(lines[j]) === 0 &&
      lines[j].trim() &&
      !lines[j].trim().startsWith("#")
    ) {
      end = j;
      break;
    }
  }
  return { startLine: start + 1, endLine: end, indent: 0 };
}

/** Подсекция `name:` внутри parentRange (`widgets:`, `groups:`, `items:`). */
function findSubsectionRange(
  content: string,
  parent: Range1BasedInclusive,
  subsectionName: string,
): Range1BasedInclusive | null {
  const lines = content.split("\n");
  const start0 = parent.startLine - 1;
  const end0 = parent.endLine;

  let containerStart = -1;
  let containerIndent = -1;
  for (let i = start0 + 1; i < end0; i++) {
    const m = lines[i].match(/^(\s*)([a-zA-Z_][\w]*)\s*:\s*(?:#.*)?$/);
    if (m && m[2] === subsectionName) {
      containerStart = i;
      containerIndent = m[1].length;
      break;
    }
  }
  if (containerStart < 0) return null;

  let containerEnd = end0;
  for (let j = containerStart + 1; j < end0; j++) {
    if (!lines[j].trim()) continue;
    const ind = indentOf(lines[j]);
    if (ind <= containerIndent && !lines[j].trim().startsWith("#")) {
      containerEnd = j;
      break;
    }
  }
  return {
    startLine: containerStart + 1,
    endLine: containerEnd,
    indent: containerIndent,
  };
}

/** `- id: itemId` внутри range. endLine — 1-based inclusive (exclusive-в-0-based). */
function findItemRangeIn(
  content: string,
  range: Range1BasedInclusive,
  itemId: string,
): Range1BasedInclusive | null {
  const lines = content.split("\n");
  const start0 = range.startLine - 1;
  const end0 = range.endLine;
  const idRegex = /^(\s*)-\s+id\s*:\s*["']?([^\s"'#]+)["']?\s*(?:#.*)?$/;

  for (let i = start0; i < end0; i++) {
    const m = lines[i].match(idRegex);
    if (!m || m[2] !== itemId) continue;
    const dashIndent = m[1].length;

    let itemEnd = end0;
    for (let j = i + 1; j < end0; j++) {
      if (!lines[j].trim()) continue;
      const ind = indentOf(lines[j]);
      if (ind < dashIndent) {
        itemEnd = j;
        break;
      }
      const dash = lines[j].match(/^(\s*)-\s+\S/);
      if (dash && dash[1].length === dashIndent) {
        itemEnd = j;
        break;
      }
    }
    return { startLine: i + 1, endLine: itemEnd, indent: dashIndent };
  }
  return null;
}

/**
 * Находит YAML-диапазон блока по blockId (с учётом parentViewId для nested).
 * Возвращает 1-based inclusive range — для замены в Monaco.
 */
export function findBlockRange(
  content: string,
  blockId: string,
  parentViewId?: string,
): Range1BasedInclusive | null {
  if (!blockId) return null;
  const colon = blockId.indexOf(":");
  if (colon < 0) return null;
  const kind = blockId.slice(0, colon);
  const rest = blockId.slice(colon + 1);

  if (kind === "action") {
    const sec = findTopSectionRange(content, "actions");
    return sec ? findItemRangeIn(content, sec, rest) : null;
  }
  if (kind === "media") {
    const sec = findTopSectionRange(content, "medias");
    return sec ? findItemRangeIn(content, sec, rest) : null;
  }
  if (kind === "menuItem") {
    const slash = rest.indexOf("/");
    if (slash < 0) return null;
    const rootId = rest.slice(0, slash);
    const itemId = rest.slice(slash + 1);
    const sec = findTopSectionRange(content, "menus");
    if (!sec) return null;
    const root = findItemRangeIn(content, sec, rootId);
    if (!root) return null;
    const itemsSub = findSubsectionRange(content, root, "items");
    return itemsSub ? findItemRangeIn(content, itemsSub, itemId) : null;
  }
  if (kind === "view") {
    const sec = findTopSectionRange(content, "views");
    if (!sec) return null;
    if (parentViewId) {
      const parent = findItemRangeIn(content, sec, parentViewId);
      if (!parent) return null;
      const viewsSub = findSubsectionRange(content, parent, "views");
      return viewsSub ? findItemRangeIn(content, viewsSub, rest) : null;
    }
    return findItemRangeIn(content, sec, rest);
  }
  if (kind === "widget") {
    const slash = rest.indexOf("/");
    if (slash < 0) return null;
    const parentId = rest.slice(0, slash);
    const widgetId = rest.slice(slash + 1);
    const sec = findTopSectionRange(content, "views");
    if (!sec) return null;
    const parent = findItemRangeIn(content, sec, parentId);
    if (!parent) return null;
    const widgetsSub = findSubsectionRange(content, parent, "widgets");
    return widgetsSub ? findItemRangeIn(content, widgetsSub, widgetId) : null;
  }
  if (kind === "group") {
    const slash = rest.indexOf("/");
    if (slash < 0) return null;
    const parentId = rest.slice(0, slash);
    const groupId = rest.slice(slash + 1);
    const sec = findTopSectionRange(content, "views");
    if (!sec) return null;
    const parent = findItemRangeIn(content, sec, parentId);
    if (!parent) return null;
    const groupsSub = findSubsectionRange(content, parent, "groups");
    return groupsSub ? findItemRangeIn(content, groupsSub, groupId) : null;
  }
  if (kind === "tree") {
    const sec = findTopSectionRange(content, "trees");
    return sec ? findItemRangeIn(content, sec, rest) : null;
  }
  return null;
}

/**
 * Собирает id существующих элементов в подсекции viewX (widgets/groups/views).
 * Нужно для дедупликации при повторном apply без save — когда серверный
 * model index ещё не видит YAML в Monaco.
 */
export function extractExistingIds(
  content: string,
  viewId: string,
  section: "widgets" | "groups" | "views",
): Set<string> {
  const ids = new Set<string>();
  const points = findViewInsertPoints(content, viewId);
  const point = points.find((p) => p.section === section);

  if (!point || !point.exists) return ids;
  if (!point.containerStartLine || point.containerEndLine == null) return ids;
  if (point.dashIndent == null) return ids;

  const lines = content.split("\n");
  const start0 = point.containerStartLine; // 1-based → 0-based
  const end0 = point.containerEndLine; // 1-based exclusive → 0-based exclusive
  const dashIndent = point.dashIndent;
  const idRegex = /^(\s*)-\s+id\s*:\s*["']?([^\s"'#]+)["']?/;

  for (let i = start0; i < end0 && i < lines.length; i++) {
    const m = lines[i].match(idRegex);
    if (m && m[1].length === dashIndent) {
      ids.add(m[2]);
    }
  }

  return ids;
}
