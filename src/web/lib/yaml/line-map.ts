import type { DomainSchemaSummary } from "../../../shared/model-types";
import { buildLineContexts, LineContext } from "./line-context";
export type { LineContext };

export interface NavNode {
  id: string;
  label: string;
  /** 1-based строка в файле. */
  line: number;
  /** Тип: attribute / widget / group / value / tab / ... */
  type: string;
  meta?: string;
  children?: NavNode[];
}

export interface SectionBlock {
  key: string;
  label: string;
  line: number;
  count: number;
  linesCount: number;
  nodes: NavNode[];
}

export interface LineMap {
  sections: SectionBlock[];
  /** Ключи только для корневых элементов: `<section>#<id>`. */
  itemLines: Map<string, number>;
}

export interface LineMap {
  sections: SectionBlock[];
  itemLines: Map<string, number>;
  lineContexts: Map<number, LineContext>;
}

const SECTION_LABELS: Record<string, string> = {
  entities: "Сущности",
  linkages: "Связи",
  dataTypes: "Типы данных",
  sequences: "Последовательности",
  counterColorPattern: "Цветовые схемы",
  trees: "Деревья",
  transitiveLinkages: "Транзитивные связи",
  mixins: "Миксины",
  dataRules: "Правила данных",
  exchangeSettings: "Обмен данными",
  actions: "Действия",
  medias: "Иконки",
  views: "Представления",
  menus: "Меню",
  uiRules: "UI Rules",
  uiPresets: "UI Presets",
};

/** Контейнеры, внутри которых ищем вложенные `- id:`. */
/**
 * Ключи, внутри которых лежат `- id:`-объекты, которые надо показать в дереве.
 * Покрывает все секции схемы.
 */
const CHILD_CONTAINERS = new Set([
  // сущности
  "attributes",
  "sorting",
  "projection",
  "identification",
  "reconciliation",
  "searching",
  // linkages
  "attributes",
  // views
  "widgets",
  "groups",
  "views",
  "tabs",
  "menu",
  "buttons",
  "footer",
  "actionPanel",
  "menuOptions",
  "items",
  // dataTypes (enum / workflow / table)
  "values",
  "statuses",
  // dataRules
  "attributes",
  "linkages",
  "nested",
  // transitive linkages
  "joins",
  // mixins
  "change",
  // actions (bulkSettings, prefixRules и т.п.)
  "bulkSettings",
  "prefixRules",
  "transitions",
]);

/**
 * Универсальный рекурсивный сборщик дочерних `- id:` внутри диапазона строк.
 *
 * @param lines       все строки файла
 * @param startIdx    0-based, строка родителя (`- id: ...`)
 * @param endIdx      0-based, до какого индекса искать (не включая)
 * @param parentIndent отступ строки `- id:` родителя
 */

/**
 * Снимает внешние кавычки (одинарные или двойные), не трогая содержимое.
 * "Transport" → Transport; 'Transport' → Transport; Transport → Transport.
 * Id с внутренними кавычками невалиден по нотации — не обрабатываем.
 */
function stripQuotes(s: string): string {
  if (s.length >= 2) {
    const f = s[0];
    const l = s[s.length - 1];
    if ((f === '"' && l === '"') || (f === "'" && l === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}

 function collectChildren(
   lines: string[],
   startIdx: number,
   endIdx: number,
   parentIndent: number,
 ): NavNode[] {
   const children: NavNode[] = [];

   for (let i = startIdx + 1; i < endIdx; i++) {
     const line = lines[i];
     if (!line || !line.trim()) continue;
     if (line.trim().startsWith("#")) continue;
     const indent = (line.match(/^(\s*)/) || ["", ""])[1].length;
     if (indent <= parentIndent) break;

     const containerMatch = line.match(
       /^(\s+)([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*(?:#.*)?$/,
     );
     if (!containerMatch) continue;
     const containerName = containerMatch[2];
     if (!CHILD_CONTAINERS.has(containerName)) continue;
     const containerIndent = containerMatch[1].length;

     children.push(
       ...scanItemsInContainer(
         lines,
         i,
         endIdx,
         containerName,
         containerIndent,
       ),
     );
   }

   return children;
 }

 /**
  * Собирает `- <key>: <value>`-элементы внутри контейнера `key:`.
  * Поддерживает id элемента как в форме `- id: X` (на itemIndent),
  * так и в форме `id: X` (на itemIndent + 2) — валидный YAML,
  * когда элемент начинается с другого ключа (например, `- attributes:`).
  */
 function scanItemsInContainer(
   lines: string[],
   containerStart: number,
   endIdx: number,
   containerName: string,
   containerIndent: number,
 ): NavNode[] {
   const children: NavNode[] = [];

   // Определяем itemIndent по первому "- " с indent > containerIndent.
   let itemIndent = -1;
   for (let i = containerStart + 1; i < endIdx; i++) {
     const line = lines[i];
     if (!line || !line.trim()) continue;
     const indent = (line.match(/^(\s*)/) || ["", ""])[1].length;
     if (indent <= containerIndent) break;
     const dashM = line.match(/^(\s*)-\s+\S/);
     if (!dashM) continue;
     itemIndent = dashM[1].length;
     break;
   }
   if (itemIndent < 0) return children;

   const fieldIndent = itemIndent + 2;
   const dashRegex = /^(\s*)-\s+\S/;
   const dashIdRegex = /^(\s*)-\s+id:\s+([^\s#]+)/;
   const fieldIdRegex = /^(\s*)id\s*:\s*([^\s#]+)/;

   let i = containerStart + 1;
   while (i < endIdx) {
     const line = lines[i];
     if (!line || !line.trim()) {
       i++;
       continue;
     }
     const indent = (line.match(/^(\s*)/) || ["", ""])[1].length;
     if (indent <= containerIndent) break;

     const dashM = line.match(dashRegex);
     if (!dashM || dashM[1].length !== itemIndent) {
       i++;
       continue;
     }

     // Границы элемента — до следующего "- " на itemIndent
     let itemEnd = endIdx;
     for (let k = i + 1; k < endIdx; k++) {
       const kLine = lines[k];
       if (!kLine || !kLine.trim()) {
         itemEnd = k + 1;
         continue;
       }
       const kIndent = (kLine.match(/^(\s*)/) || ["", ""])[1].length;
       if (kIndent < itemIndent) {
         itemEnd = k;
         break;
       }
       const kDash = kLine.match(dashRegex);
       if (kDash && kDash[1].length === itemIndent) {
         itemEnd = k;
         break;
       }
       itemEnd = k + 1;
     }

     // id элемента: "- id: X" на itemIndent или "id: X" на itemIndent + 2
     let nodeId: string | null = null;
     for (let k = i; k < itemEnd; k++) {
       const kLine = lines[k];
       const dashIdM = kLine.match(dashIdRegex);
       if (dashIdM && dashIdM[1].length === itemIndent) {
         nodeId = stripQuotes(dashIdM[2]);
         break;
       }
       const fieldIdM = kLine.match(fieldIdRegex);
       if (fieldIdM && fieldIdM[1].length === fieldIndent) {
         nodeId = stripQuotes(fieldIdM[2]);
         break;
       }
     }
     if (!nodeId) {
       i = itemEnd;
       continue;
     }

     const nested = collectChildren(lines, i, itemEnd, itemIndent);

     let meta: string | undefined;
     for (let k = i + 1; k < itemEnd; k++) {
       const kLine = lines[k];
       if (!kLine || !kLine.trim()) continue;
       const kIndent = (kLine.match(/^(\s*)/) || ["", ""])[1].length;
       if (kIndent < itemIndent) break;
       const m = kLine.match(/^\s*(dataType|type|kind):\s+(\S+)/);
       if (m) {
         meta = m[2].replace(/["']/g, "");
         break;
       }
     }

     children.push({
       id: nodeId,
       label: nodeId,
       line: i + 1,
       type: containerName.replace(/s$/, ""),
       meta,
       children: nested.length > 0 ? nested : undefined,
     });

     i = itemEnd;
   }

   return children;
 }

 /**
  * Если элемент секции начинается с "- <container>:" (например, "- attributes:")
  * — это тот же контейнер, что и обычный "<container>:", но на стартовой строке
  * самого элемента. Обрабатываем его как контейнер.
  */
 function collectChildrenFromEntityStart(
   lines: string[],
   startIdx: number,
   endIdx: number,
   entityDashIndent: number,
 ): NavNode[] {
   const line = lines[startIdx];
   if (!line) return [];
   const m = line.match(/^(\s*)-\s+([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*$/);
   if (!m) return [];
   const containerName = m[2];
   if (!CHILD_CONTAINERS.has(containerName)) return [];
   const containerIndent = m[1].length;
   if (containerIndent !== entityDashIndent) return [];

   return scanItemsInContainer(
     lines,
     startIdx,
     endIdx,
     containerName,
     containerIndent,
   );
 }

/**
 * Строит карту строк из YAML-текста.
 *
 * Не нуждается в YAML-парсере — работает с отступами и `- id:`.
 * Использует schema только для фильтрации по известным id (защита от ложных совпадений).
 */
export function buildLineMap(
  text: string,
  schema: DomainSchemaSummary,
): LineMap {
  const lines = text.split("\n");
  const sections: SectionBlock[] = [];
  const itemLines = new Map<string, number>();

  const idRegex = /^(\s*)-\s+id:\s*([^\s#]+)/;
  const sectionRegex = /^([a-zA-Z][a-zA-Z0-9_]*):\s*(?:#.*)?$/;

  const sectionRanges: Array<{ key: string; start: number; end: number }> = [];
  let currentKey: string | null = null;
  let currentStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(sectionRegex);
    if (m) {
      if (currentKey) {
        sectionRanges.push({ key: currentKey, start: currentStart, end: i });
      }
      currentKey = m[1];
      currentStart = i;
    }
  }
  if (currentKey) {
    sectionRanges.push({
      key: currentKey,
      start: currentStart,
      end: lines.length,
    });
  }

  sectionRanges.forEach(({ key, start, end }) => {
    // ============ Специальная обработка: trees ============
    if (key === "trees") {
      const nodes = parseTreesSection(lines, start, end);
      if (nodes.length > 0) {
        sections.push({
          key,
          label: SECTION_LABELS[key] || key,
          line: start + 1,
          count: nodes.length,
          linesCount: end - start,
          nodes,
        });
        nodes.forEach((n) => {
          itemLines.set(`trees#${n.id}`, n.line);
          (n.children || []).forEach((c) =>
            itemLines.set(`trees#${c.id}`, c.line),
          );
        });
      }
      return;
    }

    // ============ Специальная обработка: transitiveLinkages ============
    if (key === "transitiveLinkages") {
      const nodes = parseTransitiveSection(lines, start, end);
      if (nodes.length > 0) {
        sections.push({
          key,
          label: SECTION_LABELS[key] || key,
          line: start + 1,
          count: nodes.length,
          linesCount: end - start,
          nodes,
        });
        const collect = (arr: NavNode[]): void => {
          arr.forEach((n) => {
            itemLines.set(`transitiveLinkages#${n.id}`, n.line);
            if (n.children) collect(n.children);
          });
        };
        collect(nodes);
      }
      return;
    }

    // ============ Обычная обработка ============
    const sectionSchema = (schema.sections as any)?.[key];
    if (!sectionSchema) return;

    // Минимальный dash-indent в секции — "шаг" элементов.
    // Это работает для обоих вариантов элемента:
    //   "- id: X"               (стандарт)
    //   "- attributes: ...\n id: X"  (валидный YAML — атрибуты первыми)
    let entityDashIndent = -1;
    for (let i = start + 1; i < end; i++) {
      const line = lines[i];
      if (!line.trim() || line.trim().startsWith("#")) continue;
      const m = line.match(/^(\s*)-\s+\S/);
      if (!m) continue;
      const indent = m[1].length;
      if (entityDashIndent === -1 || indent < entityDashIndent) {
        entityDashIndent = indent;
      }
    }
    if (entityDashIndent < 0) return;

    const fieldIndent = entityDashIndent + 2;
    const dashRegex = /^(\s*)-\s+\S/;
    const dashIdRegex = /^(\s*)-\s+id:\s+([^\s#]+)/;
    const fieldIdRegex = /^(\s*)id\s*:\s*([^\s#]+)/;

    const nodes: NavNode[] = [];

    let i = start + 1;
    while (i < end) {
      const line = lines[i];
      if (!line.trim() || line.trim().startsWith("#")) {
        i++;
        continue;
      }

      const dashM = line.match(dashRegex);
      if (!dashM || dashM[1].length !== entityDashIndent) {
        i++;
        continue;
      }

      // Границы элемента
      let itemEnd = end;
      for (let k = i + 1; k < end; k++) {
        const kLine = lines[k];
        if (!kLine || !kLine.trim()) {
          itemEnd = k + 1;
          continue;
        }
        const kIndent = (kLine.match(/^(\s*)/) || ["", ""])[1].length;
        if (kIndent < entityDashIndent) {
          itemEnd = k;
          break;
        }
        const kDash = kLine.match(dashRegex);
        if (kDash && kDash[1].length === entityDashIndent) {
          itemEnd = k;
          break;
        }
        itemEnd = k + 1;
      }

      // id — "- id: X" на entityDashIndent или "id: X" на fieldIndent
      let entityId: string | null = null;
      for (let k = i; k < itemEnd; k++) {
        const kLine = lines[k];
        const dashIdM = kLine.match(dashIdRegex);
        if (dashIdM && dashIdM[1].length === entityDashIndent) {
          entityId = stripQuotes(dashIdM[2]);
          break;
        }
        const fieldIdM = kLine.match(fieldIdRegex);
        if (fieldIdM && fieldIdM[1].length === fieldIndent) {
          entityId = stripQuotes(fieldIdM[2]);
          break;
        }
      }

      if (!entityId) {
        i = itemEnd;
        continue;
      }
      const id = entityId;

      // Дети: сначала "- <container>:" со стартовой строки (например "- attributes:"),
      // потом обычные "<container>:" внутри.
      const children = [
        ...collectChildrenFromEntityStart(lines, i, itemEnd, entityDashIndent),
        ...collectChildren(lines, i, itemEnd, entityDashIndent),
      ];

      let meta: string | undefined;
      const schemaItem = sectionSchema.items?.find?.((x: any) => x.id === id);
      if (schemaItem) {
        if (key === "entities" && schemaItem.attributesCount != null) {
          meta = `${schemaItem.attributesCount} атр.`;
        } else if (schemaItem.type) {
          meta = schemaItem.type;
        } else if (schemaItem.kind) {
          meta = schemaItem.kind;
        } else if (schemaItem.target) {
          meta = schemaItem.target;
        } else if (schemaItem.effect) {
          meta = schemaItem.effect;
        }
      }

      itemLines.set(`${key}#${id}`, i + 1);

      let nodeType = key.replace(/s$/, "");
      if (key === "actions") {
        for (let k = i + 1; k < itemEnd; k++) {
          if (/^\s*type\s*:\s*scenario\b/.test(lines[k])) {
            nodeType = "actionScenario";
            break;
          }
          if (
            /^\s*-\s+id\s*:/.test(lines[k]) &&
            (lines[k].match(/^(\s*)/) || ["", ""])[1].length <= entityDashIndent
          ) {
            break;
          }
        }
      }

      nodes.push({
        id,
        label: schemaItem?.name || id,
        line: i + 1,
        type: nodeType,
        meta,
        children: children.length > 0 ? children : undefined,
      });

      i = itemEnd;
    }

    if (nodes.length > 0) {
      sections.push({
        key,
        label: SECTION_LABELS[key] || key,
        line: start + 1,
        count: nodes.length,
        linesCount: end - start,
        nodes,
      });
    }
  });

  sections.sort((a, b) => a.line - b.line);
  const lineContexts = buildLineContexts(text);
  return { sections, itemLines, lineContexts };
}

/**
 * Находит строку атрибута внутри сущности. Проходит и по вложенным
 * (Table/Array item).
 */
export function findAttributeInEntity(
  entityId: string,
  attributePath: string,
  lineMap: LineMap,
): number | null {
  const section = lineMap.sections.find((s) => s.key === "entities");
  if (!section) return null;
  const entity = section.nodes.find((n) => n.id === entityId);
  if (!entity || !entity.children) return null;

  const segments = attributePath.split(".");
  const first = segments[0];

  const stack: NavNode[] = [...entity.children];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.id === first) {
      if (segments.length === 1) return node.line;
      let current: NavNode | undefined = node;
      for (let i = 1; i < segments.length; i++) {
        const next = (current?.children || []).find(
          (c) => c.id === segments[i],
        );
        if (!next) return node.line;
        current = next;
      }
      return current?.line ?? null;
    }
    if (node.children) stack.push(...node.children);
  }
  return null;
}

// ============ Специальные парсеры ============

function findRangeInLines(
  lines: string[],
  startIdx: number,
  endIdx: number,
  indent: number,
): number {
  for (let i = startIdx + 1; i < endIdx; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind <= indent) return i;
  }
  return endIdx;
}

/** Парсит секцию trees: дерево, hierarchy, children (рекурсивно). */
function parseTreesSection(
  lines: string[],
  start: number,
  end: number,
): NavNode[] {
  const trees: NavNode[] = [];
  const idRegex = /^(\s*)-\s+id\s*:\s*([^\s#]+)/;

  let treeIndent = -1;
  for (let i = start + 1; i < end; i++) {
    const m = lines[i].match(idRegex);
    if (m) {
      treeIndent = m[1].length;
      break;
    }
  }
  if (treeIndent < 0) return [];

  for (let i = start + 1; i < end; i++) {
    const m = lines[i].match(idRegex);
    if (!m || m[1].length !== treeIndent) continue;

    const treeId = stripQuotes(m[2]);
    const treeEnd = findRangeInLines(lines, i, end, treeIndent);

    // Ищем hierarchy
    let hierarchyLine = -1;
    let hierarchyIndent = -1;
    for (let j = i + 1; j < treeEnd; j++) {
      const lm = lines[j].match(/^(\s*)hierarchy\s*:\s*$/);
      if (lm) {
        hierarchyLine = j;
        hierarchyIndent = lm[1].length;
        break;
      }
    }

    const children: NavNode[] = [];

    if (hierarchyLine >= 0) {
      const hierarchyEnd = findRangeInLines(
        lines,
        hierarchyLine,
        treeEnd,
        hierarchyIndent,
      );

      // Корневая сущность hierarchy.entity — как первый child
      let rootEntity: string | null = null;
      let rootEntityLine = -1;
      for (let j = hierarchyLine + 1; j < hierarchyEnd; j++) {
        const lm = lines[j].match(/^\s*entity\s*:\s*([^\s#]+)/);
        if (lm) {
          rootEntity = lm[1].replace(/["']/g, "");
          rootEntityLine = j;
          break;
        }
      }

      let rootChildren: NavNode[] = [];

      // Ищем children внутри hierarchy (глубина 1)
      for (let j = hierarchyLine + 1; j < hierarchyEnd; j++) {
        const lm = lines[j].match(/^(\s*)children\s*:\s*$/);
        if (!lm) continue;
        const childrenIndent = lm[1].length;
        if (childrenIndent <= hierarchyIndent) continue;

        const childrenEnd = findRangeInLines(
          lines,
          j,
          hierarchyEnd,
          childrenIndent,
        );
        const childNodes = parseTreeChildren(
          lines,
          j,
          childrenEnd,
          rootEntity,
          1,
        );
        rootChildren.push(...childNodes);
        break;
      }

      if (rootEntity) {
        children.push({
          id: rootEntity,
          label: rootEntity,
          line: rootEntityLine + 1,
          type: "entity",
          meta: "корень",
          children: rootChildren.length > 0 ? rootChildren : undefined,
        });
      } else if (rootChildren.length > 0) {
        children.push(...rootChildren);
      }
    }

    trees.push({
      id: treeId,
      label: treeId,
      line: i + 1,
      type: "tree",
      children: children.length > 0 ? children : undefined,
    });

    i = treeEnd - 1;
  }

  return trees;
}

function parseTreeChildren(
  lines: string[],
  childrenLine: number,
  childrenEnd: number,
  parentEntity: string | null,
  depth: number,
): NavNode[] {
  const result: NavNode[] = [];
  if (depth > 10) return result;

  // Регекспы для child: `- linkage: X` или `- entity: X`
  const childStartRegex = /^(\s*)-\s+(linkage|entity)\s*:\s*([^\s#]+)/;

  let childIndent = -1;
  for (let i = childrenLine + 1; i < childrenEnd; i++) {
    const m = lines[i].match(childStartRegex);
    if (m) {
      childIndent = m[1].length;
      break;
    }
  }
  if (childIndent < 0) return result;

  for (let i = childrenLine + 1; i < childrenEnd; i++) {
    const m = lines[i].match(childStartRegex);
    if (!m || m[1].length !== childIndent) continue;

    // Определяем границы текущего child (до следующего `- linkage:` / `- entity:` с тем же indent)
    const childEnd = findRangeInLines(lines, i, childrenEnd, childIndent);

    // Извлекаем linkage и entity
    let linkage: string | null =
      m[2] === "linkage" ? stripQuotes(m[3]) : null;
    let entity: string | null =
      m[2] === "entity" ? stripQuotes(m[3]) : null;

    for (let j = i + 1; j < childEnd; j++) {
      const lm = lines[j].match(/^\s*(linkage|entity)\s*:\s*([^\s#]+)/);
      if (lm) {
        const val = lm[2].replace(/["']/g, "");
        if (lm[1] === "linkage" && !linkage) linkage = val;
        else if (lm[1] === "entity" && !entity) entity = val;
      }
    }

    // Вложенные children
    let nestedChildren: NavNode[] = [];
    for (let j = i + 1; j < childEnd; j++) {
      const lm = lines[j].match(/^(\s*)children\s*:\s*$/);
      if (!lm) continue;
      const nestedIndent = lm[1].length;
      const nestedEnd = findRangeInLines(lines, j, childEnd, nestedIndent);
      nestedChildren = parseTreeChildren(
        lines,
        j,
        nestedEnd,
        entity,
        depth + 1,
      );
      break;
    }

    // Идентификатор узла: если есть entity — используем его, иначе linkage
    const displayId = entity || linkage || `child_${i}`;
    const meta = linkage
      ? `${linkage}${entity ? "" : ""}`
      : entity
        ? "сущность"
        : "";

    result.push({
      id: displayId,
      label: displayId,
      line: i + 1,
      type: "entity",
      meta: meta || undefined,
      children: nestedChildren.length > 0 ? nestedChildren : undefined,
    });

    i = childEnd - 1;
  }

  return result;
}

/** Парсит transitiveLinkages: дерево, joins (рекурсивно). */
function parseTransitiveSection(
  lines: string[],
  start: number,
  end: number,
): NavNode[] {
  const trees: NavNode[] = [];
  const idRegex = /^(\s*)-\s+id\s*:\s*([^\s#]+)/;

  let treeIndent = -1;
  for (let i = start + 1; i < end; i++) {
    const m = lines[i].match(idRegex);
    if (m) {
      treeIndent = m[1].length;
      break;
    }
  }
  if (treeIndent < 0) return [];

  for (let i = start + 1; i < end; i++) {
    const m = lines[i].match(idRegex);
    if (!m || m[1].length !== treeIndent) continue;

    const treeId = stripQuotes(m[2]);
    const treeEnd = findRangeInLines(lines, i, end, treeIndent);

    // entity — корень
    let rootEntity: string | null = null;
    for (let j = i + 1; j < treeEnd; j++) {
      const lm = lines[j].match(/^\s*entity\s*:\s*([^\s#]+)/);
      if (lm) {
        rootEntity = lm[1].replace(/["']/g, "");
        break;
      }
    }

    // joins
    let joinsLine = -1;
    let joinsIndent = -1;
    for (let j = i + 1; j < treeEnd; j++) {
      const lm = lines[j].match(/^(\s*)joins\s*:\s*$/);
      if (lm) {
        joinsLine = j;
        joinsIndent = lm[1].length;
        break;
      }
    }

    let children: NavNode[] = [];
    if (joinsLine >= 0) {
      const joinsEnd = findRangeInLines(lines, joinsLine, treeEnd, joinsIndent);
      children = parseJoins(lines, joinsLine, joinsEnd, 1);
    }

    trees.push({
      id: treeId,
      label: treeId,
      line: i + 1,
      type: "transitiveLinkage",
      meta: rootEntity || undefined,
      children: children.length > 0 ? children : undefined,
    });

    i = treeEnd - 1;
  }

  return trees;
}

function parseJoins(
  lines: string[],
  joinsLine: number,
  joinsEnd: number,
  depth: number,
): NavNode[] {
  const result: NavNode[] = [];
  if (depth > 8) return result;

  const idRegex = /^(\s*)-\s+id\s*:\s*([^\s#]+)/;

  let joinIndent = -1;
  for (let i = joinsLine + 1; i < joinsEnd; i++) {
    const m = lines[i].match(idRegex);
    if (m) {
      joinIndent = m[1].length;
      break;
    }
  }
  if (joinIndent < 0) return result;

  for (let i = joinsLine + 1; i < joinsEnd; i++) {
    const m = lines[i].match(idRegex);
    if (!m || m[1].length !== joinIndent) continue;

    const joinId = stripQuotes(m[2]);
    const joinEnd = findRangeInLines(lines, i, joinsEnd, joinIndent);

    // Извлекаем linkage
    let linkage: string | null = null;
    for (let j = i + 1; j < joinEnd; j++) {
      const lm = lines[j].match(/^\s*linkage\s*:\s*([^\s#]+)/);
      if (lm) {
        linkage = lm[1].replace(/["']/g, "");
        break;
      }
    }

    // Ищем вложенные joins
    let nestedChildren: NavNode[] = [];
    for (let j = i + 1; j < joinEnd; j++) {
      const lm = lines[j].match(/^(\s*)joins\s*:\s*$/);
      if (!lm) continue;
      const nestedJoinsIndent = lm[1].length;
      const nestedJoinsEnd = findRangeInLines(
        lines,
        j,
        joinEnd,
        nestedJoinsIndent,
      );
      nestedChildren = parseJoins(lines, j, nestedJoinsEnd, depth + 1);
      break;
    }

    result.push({
      id: joinId,
      label: joinId,
      line: i + 1,
      type: "join",
      meta: linkage || undefined,
      children: nestedChildren.length > 0 ? nestedChildren : undefined,
    });

    i = joinEnd - 1;
  }

  return result;
}
