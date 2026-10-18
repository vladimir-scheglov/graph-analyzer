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
};

/** Контейнеры, внутри которых ищем вложенные `- id:`. */
/**
 * Ключи, внутри которых лежат `- id:`-объекты, которые надо показать в дереве.
 * Покрывает все секции R-Vision схемы.
 */
const CHILD_CONTAINERS = new Set([
  // сущности
  'attributes',
  'sorting',
  'projection',
  'identification',
  'reconciliation',
  'searching',
  // linkages
  'attributes',
  // views
  'widgets',
  'groups',
  'views',
  'tabs',
  'menu',
  'buttons',
  'footer',
  'actionPanel',
  'menuOptions',
  'items',
  // dataTypes (enum / workflow / table)
  'values',
  'statuses',
  // dataRules
  'attributes',
  'linkages',
  'nested',
  // transitive linkages
  'joins',
  // mixins
  'change',
  // actions (bulkSettings, prefixRules и т.п.)
  'bulkSettings',
  'prefixRules',
  'transitions'
]);

/**
 * Универсальный рекурсивный сборщик дочерних `- id:` внутри диапазона строк.
 *
 * @param lines       все строки файла
 * @param startIdx    0-based, строка родителя (`- id: ...`)
 * @param endIdx      0-based, до какого индекса искать (не включая)
 * @param parentIndent отступ строки `- id:` родителя
 */
function collectChildren(
  lines: string[],
  startIdx: number,
  endIdx: number,
  parentIndent: number,
): NavNode[] {
  const children: NavNode[] = [];
  const idRegex = /^(\s*)-\s+id:\s+([^\s#]+)/;

  for (let i = startIdx + 1; i < endIdx; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    if (line.trim().startsWith("#")) continue;

    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;

    // Вышли за пределы родителя
    if (indent <= parentIndent) break;

    // Это контейнер?
    const containerMatch = line.match(
      /^(\s+)([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*(?:#.*)?$/,
    );
    if (!containerMatch) continue;
    const containerName = containerMatch[2];
    if (!CHILD_CONTAINERS.has(containerName)) continue;

    const containerIndent = containerMatch[1].length;

    // Идём по содержимому контейнера
    for (let j = i + 1; j < endIdx; j++) {
      const wLine = lines[j];
      if (!wLine || !wLine.trim()) continue;

      const wIndentMatch = wLine.match(/^(\s*)/);
      const wIndent = wIndentMatch ? wIndentMatch[1].length : 0;

      // Конец контейнера
      if (wIndent <= containerIndent) break;

      const idMatch = wLine.match(idRegex);
      if (!idMatch) continue;

      const itemIndent = idMatch[1].length;
      if (itemIndent <= containerIndent) continue;

      // Определяем диапазон этого элемента
      let itemEnd = j + 1;
      for (let k = j + 1; k < endIdx; k++) {
        const kLine = lines[k];
        if (!kLine || !kLine.trim()) {
          itemEnd = k + 1;
          continue;
        }
        const kIndentMatch = kLine.match(/^(\s*)/);
        const kIndent = kIndentMatch ? kIndentMatch[1].length : 0;
        if (kIndent < itemIndent) {
          itemEnd = k;
          break;
        }
        if (kIndent === itemIndent && idRegex.test(kLine)) {
          itemEnd = k;
          break;
        }
        itemEnd = k + 1;
      }

      // Рекурсия
      const grandchildren = collectChildren(lines, j, itemEnd, itemIndent);

      // Метаданные — тип из YAML: `dataType: X` или `type: Y` в этом диапазоне
      let meta: string | undefined;
      for (let k = j + 1; k < itemEnd; k++) {
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
        id: idMatch[2],
        label: idMatch[2],
        line: j + 1,
        type: containerName.replace(/s$/, ""),
        meta,
        children: grandchildren.length > 0 ? grandchildren : undefined,
      });
    }
  }

  return children;
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

  const idRegex = /^(\s*)-\s+id:\s+([^\s#]+)/;
  const sectionRegex = /^([a-zA-Z][a-zA-Z0-9_]*):\s*(?:#.*)?$/;

  // ============ Ищем секции ============
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

  // ============ Для каждой известной секции собираем items ============
  sectionRanges.forEach(({ key, start, end }) => {
    const sectionSchema = (schema.sections as any)?.[key];
    if (!sectionSchema) return;

    // Находим базовый отступ items
    let baseIndent = -1;
    for (let i = start + 1; i < end; i++) {
      const m = lines[i].match(idRegex);
      if (m) {
        baseIndent = m[1].length;
        break;
      }
    }
    if (baseIndent < 0) return;

    const nodes: NavNode[] = [];

    for (let i = start + 1; i < end; i++) {
      const line = lines[i];
      const m = line.match(idRegex);
      if (!m) continue;
      if (m[1].length !== baseIndent) continue;

      const id = m[2];
      // Определяем диапазон
      let itemEnd = i + 1;
      for (let k = i + 1; k < end; k++) {
        const kLine = lines[k];
        if (!kLine || !kLine.trim()) {
          itemEnd = k + 1;
          continue;
        }
        const kIndent = (kLine.match(/^(\s*)/) || ["", ""])[1].length;
        if (kIndent < baseIndent) {
          itemEnd = k;
          break;
        }
        if (kIndent === baseIndent && idRegex.test(kLine)) {
          itemEnd = k;
          break;
        }
        itemEnd = k + 1;
      }

      const children = collectChildren(lines, i, itemEnd, baseIndent);

      // Метаданные
      let meta: string | undefined;
      const schemaItem = sectionSchema.items?.find?.((x: any) => x.id === id);
      if (schemaItem) {
        if (key === "entities" && schemaItem.attributesCount != null) {
          meta = `${schemaItem.attributesCount} атр.`;
        } else if (schemaItem.type) {
          meta = schemaItem.type;
        } else if (schemaItem.kind) {
          meta = schemaItem.kind;
        }
      }

      itemLines.set(`${key}#${id}`, i + 1);

      nodes.push({
        id,
        label: schemaItem?.name || id,
        line: i + 1,
        type: key.replace(/s$/, ""),
        meta,
        children: children.length > 0 ? children : undefined,
      });

      i = itemEnd - 1;
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
  lineMap: LineMap
): number | null {
  const section = lineMap.sections.find((s) => s.key === 'entities');
  if (!section) return null;
  const entity = section.nodes.find((n) => n.id === entityId);
  if (!entity || !entity.children) return null;

  const segments = attributePath.split('.');
  const first = segments[0];

  const stack: NavNode[] = [...entity.children];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.id === first) {
      if (segments.length === 1) return node.line;
      let current: NavNode | undefined = node;
      for (let i = 1; i < segments.length; i++) {
        const next = (current?.children || []).find((c) => c.id === segments[i]);
        if (!next) return node.line;
        current = next;
      }
      return current?.line ?? null;
    }
    if (node.children) stack.push(...node.children);
  }
  return null;
}