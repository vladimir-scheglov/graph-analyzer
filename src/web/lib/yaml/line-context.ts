export interface BreadcrumbItem {
  /** Тип элемента: section, entity, attribute, widget, view, dataRule, container, ... */
  type: string;
  /** Идентификатор или имя ключа-контейнера */
  id: string;
  /** Номер строки объявления (1-based) */
  line: number;
}

export interface LineContext {
  section: string;
  /** Для обратной совместимости: id текущей сущности (если внутри entities) */
  entityId: string | null;
  /** Полная цепочка вложенности для хлебных крошек */
  breadcrumbs: BreadcrumbItem[];
}

/** Тип `- id:` определяется по имени родительского ключа-контейнера */
const CONTAINER_TYPE_MAP: Record<string, string> = {
  entities: "entity",
  linkages: "linkage",
  attributes: "attribute",
  widgets: "widget",
  groups: "group",
  views: "view",
  actions: "action",
  dataRules: "dataRule",
  mixins: "mixin",
  sequences: "sequence",
  dataTypes: "dataType",
  menus: "menu",
  medias: "media",
  values: "enumValue",
  statuses: "workflowStatus",
  transitions: "transition",
  items: "menuItem",
  joins: "join",
  sorting: "sorting",
  identification: "identification",
  reconciliation: "reconciliation",
  projection: "projection",
  prefixRules: "prefixRule",
  rule: "rule",
  columns: "column",
  by: "sortingByItem",
  nested: "nested",
  calculation: "calculation",
  prefixRule: "prefixRule",
  trees: "tree",
  transitiveLinkages: "transitiveLinkage",
  hierarchy: "hierarchy",
  uiRules: "uiRule",
  uiPresets: "uiPreset",
  props: "props",
};

function containerType(key: string): string {
  return CONTAINER_TYPE_MAP[key] || "item";
}

interface StackItem {
  indent: number;
  key: string;
  id: string;
  line: number;
  type: string;
  isId: boolean;
}

export function buildLineContexts(text: string): Map<number, LineContext> {
  const lines = text.split("\n");
  const result = new Map<number, LineContext>();

  const stack: StackItem[] = [];
  let section = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;

    const save = () => {
      const breadcrumbs: BreadcrumbItem[] = [];
      let entityId: string | null = null;
      for (const s of stack) {
        if (s.type === "container") continue; // контейнеры не показываем в крошках
        breadcrumbs.push({ type: s.type, id: s.id, line: s.line });
        if (s.type === "entity" && entityId === null) entityId = s.id;
      }
      result.set(lineNum, { section, entityId, breadcrumbs });
    };

    if (!trimmed || trimmed.startsWith("#")) {
      save();
      continue;
    }

    const indent = (line.match(/^(\s*)/) || ["", ""])[1].length;

    // ============ Секция верхнего уровня ============
    if (indent === 0) {
      const sm = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (sm) {
        section = sm[1];
        stack.length = 0;
        stack.push({
          indent: 0,
          key: section,
          id: section,
          line: lineNum,
          type: "section",
          isId: false,
        });
        save();
        continue;
      }
    }

    // Убираем из стека всё, что на indent >= текущего (кроме самой секции)
    while (
      stack.length > 0 &&
      stack[stack.length - 1].indent >= indent &&
      stack[stack.length - 1].type !== "section"
    ) {
      stack.pop();
    }

    // ============ Элемент списка: `- id: X` ============
    const idMatch = line.match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
    if (idMatch) {
      const id = idMatch[2].replace(/["']/g, "");

      let type = "";
      for (let j = stack.length - 1; j >= 0; j--) {
        if (stack[j].type === "section") {
          type = containerType(stack[j].key);
          break;
        }
        if (stack[j].isId) continue;
        type = containerType(stack[j].key);
        break;
      }
      if (!type) type = "item";

      stack.push({ indent, key: "id", id, line: lineNum, type, isId: true });
      save();
      continue;
    }

    // ============ Ключ-контейнер: `key:` без значения ============
    const containerMatch = line.match(/^(\s*)([a-zA-Z_][\w]*)\s*:\s*$/);
    if (containerMatch) {
      const key = containerMatch[2];
      stack.push({
        indent,
        key,
        id: key,
        line: lineNum,
        type: "container",
        isId: false,
      });
      save();
      continue;
    }

    // ============ Обычное поле — стек не меняется ============
    save();
  }

  return result;
}
