import { ModelIndex } from "../../../shared/model-types";
import {
  type LineMap,
  type SectionBlock,
  type NavNode,
  findAttributeInEntity,
} from "../yaml/line-map";
import { scanRqlInText } from "./rql-check";

let providersRegistered = false;

interface ProviderContext {
  lineMap: LineMap | null;
  currentFilePath: string | null;
  currentDomainId: string | null;
  onOpenFqid?: (fqid: string) => void;
  modelIndex: ModelIndex | null;
}

const ctx: ProviderContext = {
  lineMap: null,
  currentFilePath: null,
  currentDomainId: null,
  modelIndex: null,
};

export function updateProviderContext(partial: Partial<ProviderContext>): void {
  Object.assign(ctx, partial);
}

export function resetProviderContext(): void {
  ctx.lineMap = null;
  ctx.currentFilePath = null;
  ctx.currentDomainId = null;
  ctx.onOpenFqid = undefined;
}

// ============ Поля, значения которых — ссылки на id/сущности/атрибуты ============

/** Поля, где значение — определение id (свой id). */
const DEF_FIELDS = new Set(["id"]);

/** Поля, где значение — ссылка на элемент в этом же файле (сущность, view, action). */
const REF_FIELDS = new Set([
  "inherits",
  "entity",
  "modal",
  "panel",
  "form",
  "tab",
  "list",
  "view",
  "page",
  "addLinksView",
  "fromView",
  "linkage",
  "key",
  "value",
  "widget",
  "block",
  "action",
  "menu",
  "node",
  "source",
  "join",
  "dataType",
]);

/** Поля, где значение может быть `<Entity>.<attr>` или `<Entity>` — составная ссылка. */
const ATTRIBUTE_LIKE_FIELDS = new Set([
  "attribute",
  "attributes",
  "item",
  "by",
  "use",
  "searching",
]);

const BASE_DATA_TYPES_COMPLETION = [
  "String",
  "Integer",
  "Decimal",
  "Float",
  "Bool",
  "Uuid",
  "Timestamp",
  "Date",
  "Time",
  "TimestampRange",
  "Text",
  "MAC",
  "IpAddress",
  "CIDR",
  "URL",
  "Attachment",
  "Identifier",
  "Counter",
  "Calculation",
  "Configuration",
  "Variable",
  "RQL",
  "Automation",
  "Reference",
  "Array",
  "Table",
  "Enum",
  "Workflow",
];

// ============ Разбор слова под курсором ============

interface WordHit {
  /** Тип: определение id, ссылка на сущность, ссылка на атрибут, простая ссылка. */
  type:
    | "id-def"
    | "ref-entity"
    | "ref-attribute"
    | "ref-item"
    | "ref-fqid-foreign"
    | "ref-datatype";
  /** Значение — то, что нужно искать. */
  value: string;
  /** Для attr — имя сущности. */
  entityPart?: string;
  /** Для attr — путь к атрибуту (может быть вложенным `attr.subfield`). */
  attributePart?: string;
  /** Домен-префикс FQID (если указан). */
  domainPrefix?: string | null;
  /** Полный FQID. */
  fqid?: string;
  /** Исходное поле. */
  field: string;
}

/**
 * Разбирает строку YAML и возвращает информацию о том, что находится под курсором.
 */
function findWordAtLine(lineText: string, column: number): WordHit | null {
  // Группа 3 — value с любым хвостом. group[3] заканчивается на конце строки.
  const fieldMatch = lineText.match(
    /^(\s*)(?:-\s+)?([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*(.*)$/,
  );
  if (!fieldMatch) return null;

  const field = fieldMatch[2];
  const valueRaw = fieldMatch[3].trim();
  if (!valueRaw || valueRaw.startsWith("#")) return null;

  // Надёжный расчёт начала value: group[3] идёт до конца строки,
  // значит valueRaw занимает последние (valueRaw.length) символов
  // от lineText.trimEnd().length
  const trimmedLine = lineText.replace(/\s+$/, "");
  const valueStart = trimmedLine.length - valueRaw.length;
  if (valueStart < 0) return null;
  const valueEnd = valueStart + valueRaw.length;

  // Monaco column 1-based
  if (column < valueStart + 1 || column > valueEnd) return null;

  let value = valueRaw;
  let quoteOffset = 0;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
    quoteOffset = 1;
  }

  // relativeCol — 0-based позиция внутри value
  const relativeCol = column - 1 - valueStart - quoteOffset;
  if (relativeCol < 0 || relativeCol > value.length) return null;

  if (field === "id") {
    return { type: "id-def", value, field };
  }

  if (
    field === "dataType" ||
    (field === "item" && value.startsWith("dataType"))
  ) {
    // handled elsewhere — не наша забота
  }

  if (field === "dataType") {
    return { type: "ref-datatype", value, field };
  }

  const isAttributeLike = ATTRIBUTE_LIKE_FIELDS.has(field);
  const isRefField = REF_FIELDS.has(field);
  if (!isAttributeLike && !isRefField) return null;

  const slashIdx = value.indexOf("/");
  let domainPrefix: string | null = null;
  let rest = value;
  let restStart = 0;
  if (slashIdx > 0) {
    domainPrefix = value.slice(0, slashIdx).toLowerCase();
    rest = value.slice(slashIdx + 1);
    restStart = slashIdx + 1;
  }

  const dotIdx = rest.indexOf(".");
  const isForeignDomain =
    !!domainPrefix &&
    domainPrefix !== (ctx.currentDomainId || "").toLowerCase();

  if (isAttributeLike && dotIdx > 0) {
    const entityPart = rest.slice(0, dotIdx);
    const attributePart = rest.slice(dotIdx + 1);

    const entityEndInValue = restStart + entityPart.length;
    const attrStartInValue = entityEndInValue + 1;
    const attrEndInValue = attrStartInValue + attributePart.length;

    if (relativeCol >= restStart && relativeCol <= entityEndInValue) {
      if (isForeignDomain) {
        return {
          type: "ref-fqid-foreign",
          value: entityPart,
          domainPrefix,
          fqid: domainPrefix + "/" + entityPart,
          field,
        };
      }
      return {
        type: "ref-entity",
        value: entityPart,
        domainPrefix,
        fqid: (domainPrefix ? domainPrefix + "/" : "") + entityPart,
        field,
      };
    }
    if (relativeCol >= attrStartInValue && relativeCol <= attrEndInValue) {
      if (isForeignDomain) {
        return {
          type: "ref-fqid-foreign",
          value: attributePart,
          entityPart,
          attributePart,
          domainPrefix,
          fqid: domainPrefix + "/" + entityPart + "." + attributePart,
          field,
        };
      }
      return {
        type: "ref-attribute",
        value: attributePart,
        entityPart,
        attributePart,
        domainPrefix,
        field,
      };
    }
    return null;
  }

  if (isForeignDomain) {
    return {
      type: "ref-fqid-foreign",
      value: rest,
      domainPrefix,
      fqid: domainPrefix + "/" + rest,
      field,
    };
  }

  return {
    type: "ref-item",
    value: rest,
    domainPrefix,
    fqid: (domainPrefix ? domainPrefix + "/" : "") + rest,
    field,
  };
}

// ============ Поиск определений ============

/** Ищет строку сущности по её id в секции entities. */
function findEntityLine(entityId: string, lineMap: LineMap): number | null {
  const section = lineMap.sections.find((s) => s.key === "entities");
  if (!section) return null;
  const node = section.nodes.find((n) => n.id === entityId);
  return node ? node.line : null;
}

/**
 * Ищет строку атрибута внутри сущности.
 * attributePart может быть "identifier" или "tableAttr.subField".
 */
function findAttributeLine(
  entityId: string,
  attributePart: string,
  lineMap: LineMap,
): number | null {
  const section = lineMap.sections.find((s) => s.key === "entities");
  if (!section) return null;
  const entity = section.nodes.find((n) => n.id === entityId);
  if (!entity || !entity.children) return null;

  // Полный путь из сегментов
  const segments = attributePart.split(".");
  const firstSegment = segments[0];

  // Ищем по дереву вглубь
  const stack = [...entity.children];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.id === firstSegment) {
      // Нашли первый сегмент. Если один сегмент — это он
      if (segments.length === 1) return node.line;

      // Если больше — ищем следующий сегмент в его children
      let current = node;
      for (let i = 1; i < segments.length; i++) {
        const next = (current.children || []).find((c) => c.id === segments[i]);
        if (!next) {
          // Не нашли вложенный — вернём строку первого сегмента
          return node.line;
        }
        current = next;
      }
      return current.line;
    }
    if (node.children) stack.push(...node.children);
  }
  return null;
}

/**
 * Ищет строку элемента в любой секции по его id.
 * Используется для `inherits`, `view`, `action`, `linkage` и т.п.
 */
function findItemLine(itemId: string, lineMap: LineMap): number | null {
  // Сначала — itemLines
  for (const [key, line] of lineMap.itemLines.entries()) {
    if (key.endsWith("#" + itemId)) return line;
  }
  // Потом — обход всех children
  const stack: NavNode[] = [];
  lineMap.sections.forEach((s) => stack.push(...s.nodes));
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.id === itemId) return node.line;
    if (node.children) stack.push(...node.children);
  }
  return null;
}

// ============ Symbol Provider ============

function flattenSections(sections: SectionBlock[]): Array<{
  node: NavNode;
  sectionKey: string;
  depth: number;
}> {
  const out: Array<{ node: NavNode; sectionKey: string; depth: number }> = [];
  const walk = (node: NavNode, sectionKey: string, depth: number) => {
    out.push({ node, sectionKey, depth });
    if (node.children)
      node.children.forEach((c) => walk(c, sectionKey, depth + 1));
  };
  sections.forEach((s) => s.nodes.forEach((n) => walk(n, s.key, 0)));
  return out;
}

function buildSymbols(monaco: any, lineMap: LineMap): any[] {
  const { SymbolKind } = monaco.languages;
  const SECTION_KIND: Record<string, number> = {
    entities: SymbolKind.Class,
    linkages: SymbolKind.Interface,
    dataTypes: SymbolKind.Enum,
    sequences: SymbolKind.Constant,
    actions: SymbolKind.Function,
    views: SymbolKind.Namespace,
    menus: SymbolKind.Module,
    mixins: SymbolKind.Struct,
    dataRules: SymbolKind.Rule,
    medias: SymbolKind.File,
  };

  function toSymbol(node: NavNode, sectionKey: string, depth: number): any {
    const kind =
      depth === 0
        ? SECTION_KIND[sectionKey] || SymbolKind.Object
        : depth === 1
          ? SymbolKind.Object
          : SymbolKind.Field;

    const range = {
      startLineNumber: node.line,
      startColumn: 1,
      endLineNumber: node.line,
      endColumn: 1,
    };

    return {
      name: node.id,
      detail: node.meta || node.label,
      kind,
      tags: [],
      range,
      selectionRange: range,
      children: (node.children || []).map((c) =>
        toSymbol(c, sectionKey, depth + 1),
      ),
    };
  }

  return lineMap.sections.map((section) => ({
    name: section.label,
    detail: `${section.count} items`,
    kind: SymbolKind.Namespace,
    tags: [],
    range: {
      startLineNumber: section.line,
      startColumn: 1,
      endLineNumber: section.line,
      endColumn: 1,
    },
    selectionRange: {
      startLineNumber: section.line,
      startColumn: 1,
      endLineNumber: section.line,
      endColumn: 1,
    },
    children: section.nodes.map((n) => toSymbol(n, section.key, 1)),
  }));
}

// ============ Definition Provider ============

function makeLocation(model: any, line: number): any {
  return {
    uri: model.uri,
    range: {
      startLineNumber: line,
      startColumn: 1,
      endLineNumber: line,
      endColumn: 1,
    },
  };
}

function provideDefinition(monaco: any, model: any, position: any): any {
  if (!ctx.lineMap) return null;
  const lineText = model.getLineContent(position.lineNumber);
  const hit = findWordAtLine(lineText, position.column);
  if (!hit) return null;

  if (hit.type === "id-def") return null;

  if (hit.type === "ref-entity") {
    const entityLine = findEntityLine(hit.value, ctx.lineMap);
    if (entityLine != null) return [makeLocation(model, entityLine)];
    const itemLine = findItemLine(hit.value, ctx.lineMap);
    if (itemLine != null) return [makeLocation(model, itemLine)];
    return null;
  }

  if (hit.type === "ref-attribute") {
    // Если entityPart указан явно — используем его
    // Иначе — смотрим lineContexts для контекстной сущности
    let entityId = hit.entityPart;
    if (!entityId) {
      const lc = ctx.lineMap.lineContexts.get(position.lineNumber);
      entityId = lc?.entityId || undefined;
    }
    if (!entityId) return null;

    const attrLine = findAttributeInEntity(
      entityId,
      hit.attributePart || hit.value,
      ctx.lineMap,
    );
    if (attrLine != null) return [makeLocation(model, attrLine)];
    return null;
  }

  if (hit.type === "ref-item") {
    // Сначала — контекстная сущность (attribute: os без префикса)
    const lc = ctx.lineMap.lineContexts.get(position.lineNumber);
    if (lc?.entityId && (hit.field === "attribute" || hit.field === "by")) {
      const attrLine = findAttributeInEntity(
        lc.entityId,
        hit.value,
        ctx.lineMap,
      );
      if (attrLine != null) return [makeLocation(model, attrLine)];
    }
    // Потом — обычный item
    const itemLine = findItemLine(hit.value, ctx.lineMap);
    if (itemLine != null) return [makeLocation(model, itemLine)];
    // Фоллбэк — сущность
    const entityLine = findEntityLine(hit.value, ctx.lineMap);
    if (entityLine != null) return [makeLocation(model, entityLine)];
    return null;
  }

  return null;
}

// ============ Регистрация ============

// ============ Определения полей YAML по контексту ============

interface FieldDef {
  name: string;
  type: string;
  description: string;
  required?: boolean;
}

const FIELD_DEFINITIONS: Record<string, FieldDef[]> = {
  entity: [
    {
      name: "id",
      type: "string",
      description: "Уникальный идентификатор сущности",
      required: true,
    },
    { name: "name", type: "string", description: "Человекочитаемое название" },
    {
      name: "label",
      type: "string",
      description: 'Шаблон отображаемого имени: "{attr1} {attr2}"',
    },
    { name: "description", type: "string", description: "Описание сущности" },
    {
      name: "inherits",
      type: "ref",
      description: "Ссылка на родительскую сущность (Data ID или FQID)",
    },
    {
      name: "attributes",
      type: "array",
      description: "Массив атрибутов сущности",
    },
    { name: "sorting", type: "array", description: "Правила сортировки" },
    {
      name: "searching",
      type: "object",
      description: "Набор атрибутов для поиска",
    },
    {
      name: "identification",
      type: "array",
      description: "Правила идентификации",
    },
    {
      name: "reconciliation",
      type: "array",
      description: "Правила реконсиляции",
    },
    {
      name: "projection",
      type: "array",
      description: "Проекции через Reference",
    },
    {
      name: "icons",
      type: "ref",
      description: "Иконка сущности для диаграммы",
    },
    {
      name: "graphView",
      type: "object",
      description: "Настройки отображения на графе",
    },
    {
      name: "scanTarget",
      type: "boolean",
      description: "Актив, предназначенный для сканирования",
    },
    {
      name: "scanTargetGroup",
      type: "boolean",
      description: "Группа активов для сканирования",
    },
    {
      name: "kind",
      type: "enum",
      description: "Вид сущности (по умолчанию regular)",
    },
  ],
  attribute: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор атрибута (camelCase)",
      required: true,
    },
    { name: "name", type: "string", description: "Название атрибута" },
    { name: "description", type: "string", description: "Описание атрибута" },
    {
      name: "dataType",
      type: "enum",
      description: "Тип данных (String, Reference, Array и т.д.)",
      required: true,
    },
    { name: "readonly", type: "boolean", description: "Только для чтения" },
    {
      name: "constraints",
      type: "array",
      description:
        "Ограничения: required, length, range, regexp, size, mime_types, unique",
    },
    {
      name: "entity",
      type: "ref",
      description: "Целевая сущность (для dataType: Reference)",
    },
    {
      name: "item",
      type: "object",
      description: "Параметры элемента (для dataType: Array)",
    },
    {
      name: "sequence",
      type: "ref",
      description: "Ссылка на последовательность (для Identifier)",
    },
    {
      name: "template",
      type: "string",
      description: 'Шаблон идентификатора: "{@prefix}-{@YYYY}-{@inc}"',
    },
    {
      name: "defaultPrefix",
      type: "string",
      description: "Префикс по умолчанию (для Identifier)",
    },
    {
      name: "incrementTemplate",
      type: "string",
      description: "Количество цифр для ведущих нулей",
    },
    {
      name: "segment",
      type: "array",
      description: "Сегменты переопределения шаблона",
    },
    {
      name: "prefixRules",
      type: "array",
      description: "Правила подстановки префикса",
    },
    {
      name: "calculation",
      type: "object",
      description: "Ссылка на расчёт (для dataType: Calculation)",
    },
    {
      name: "comments",
      type: "boolean",
      description: "Разрешить комментарии (для dataType: Text)",
    },
  ],
  linkage: [
    {
      name: "id",
      type: "string",
      description: "Уникальный идентификатор связи",
      required: true,
    },
    { name: "name", type: "string", description: "Название связи" },
    { name: "description", type: "string", description: "Описание связи" },
    {
      name: "side1",
      type: "ref",
      description: "Левая сторона связи (Data ID или FQID)",
      required: true,
    },
    {
      name: "side2",
      type: "ref",
      description: "Правая сторона связи",
      required: true,
    },
    {
      name: "type",
      type: "enum",
      description: "Тип связи: 1_1, 1_n, n_n",
      required: true,
    },
    {
      name: "undirected",
      type: "boolean",
      description: "Ненаправленная связь (только для n_n)",
    },
    {
      name: "nameFrom",
      type: "object",
      description: "Глагольные формы сторон (side1/side2)",
    },
    {
      name: "useForSearch",
      type: "boolean",
      description: "Использовать в поисковых запросах",
    },
    {
      name: "attributes",
      type: "array",
      description: "Пользовательские атрибуты связи",
    },
    { name: "sorting", type: "array", description: "Сортировка связей" },
    { name: "view", type: "object", description: "Цвет отображения на графе" },
    {
      name: "excludeOnGraph",
      type: "enum",
      description: "Скрытие на графе: true/false/off",
    },
  ],
  linkageAttribute: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор атрибута связи",
      required: true,
    },
    { name: "name", type: "string", description: "Название атрибута" },
    { name: "description", type: "string", description: "Описание" },
    {
      name: "dataType",
      type: "enum",
      description: "Тип данных",
      required: true,
    },
    { name: "constraints", type: "array", description: "Валидация атрибута" },
    {
      name: "searchable",
      type: "boolean",
      description: "Доступен для поиска (по умолчанию true)",
    },
  ],
  action: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор действия (View ID)",
      required: true,
    },
    { name: "name", type: "string", description: "Название действия" },
    { name: "description", type: "string", description: "Описание действия" },
    {
      name: "type",
      type: "enum",
      description:
        "Тип: open_panel, open_modal, open_page, remove, bulk, automation и др.",
      required: true,
    },
    {
      name: "entity",
      type: "ref",
      description: "Сущность, к которой применяется действие",
    },
    { name: "panel", type: "ref", description: "Панель (для open_panel)" },
    { name: "modal", type: "ref", description: "Модалка (для open_modal)" },
    {
      name: "view",
      type: "ref",
      description: "View (для open_page, open_list, open_tree)",
    },
    {
      name: "operation",
      type: "enum",
      description: "Операция: create, edit, view, remove",
    },
    {
      name: "automation",
      type: "object",
      description: "Ссылка на автоматизацию",
    },
    { name: "scenario", type: "string", description: "Сценарий/скрипт" },
    { name: "workerTag", type: "string", description: "Тег воркера сценария" },
  ],
  dataRule: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор правила",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Название правила",
      required: true,
    },
    { name: "description", type: "string", description: "Описание" },
    {
      name: "target",
      type: "enum",
      description: "entity, entityAttribute или linkage",
      required: true,
    },
    {
      name: "entity",
      type: "ref",
      description: "Целевая сущность (для entity/entityAttribute)",
    },
    {
      name: "attribute",
      type: "ref",
      description: "Целевой атрибут (для entityAttribute)",
    },
    {
      name: "linkage",
      type: "ref",
      description: "Целевая связь (для linkage)",
    },
    {
      name: "condition",
      type: "rql",
      description: "Условие правила (RQL или true)",
      required: true,
    },
    {
      name: "rule",
      type: "object",
      description: "Описание действия правила",
      required: true,
    },
    { name: "message", type: "string", description: "Сообщение об ошибке" },
    { name: "help", type: "string", description: "Справка при наведении" },
  ],
  dataRuleRule: [
    {
      name: "effect",
      type: "enum",
      description: "hidden, readonly, required, default, allowed",
      required: true,
    },
    {
      name: "attributes",
      type: "array",
      description: "Атрибуты, к которым применяется эффект",
    },
    {
      name: "nested",
      type: "object",
      description: "Nested-эффект для Table/Array",
    },
    {
      name: "linkages",
      type: "array",
      description: "Связи, к которым применяется эффект",
    },
  ],
  view: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор view (View ID)",
      required: true,
    },
    { name: "label", type: "string", description: "Заголовок" },
    { name: "description", type: "string", description: "Описание" },
    {
      name: "type",
      type: "enum",
      description: "entity, list, tabs_list, tree, dashboard, dashboard_tree",
      required: true,
    },
    {
      name: "entity",
      type: "ref",
      description: "Целевая сущность (для entity)",
    },
    { name: "widgets", type: "array", description: "Виджеты представления" },
    {
      name: "groups",
      type: "array",
      description: "Группы (блоки, вкладки, формы)",
    },
    {
      name: "views",
      type: "array",
      description: "Внутренние представления (для entity)",
    },
    {
      name: "source",
      type: "object",
      description: "Источник данных (для list)",
    },
    {
      name: "table",
      type: "object",
      description: "Табличное отображение (для list)",
    },
    {
      name: "actionPanel",
      type: "array",
      description: "Панель действий (для list)",
    },
    { name: "isMixin", type: "boolean", description: "Использовать в примеси" },
  ],
  widget: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор виджета (View ID)",
      required: true,
    },
    {
      name: "type",
      type: "enum",
      description: "attribute, action, linkage, join, history и др.",
      required: true,
    },
    { name: "description", type: "string", description: "Описание" },
    {
      name: "attribute",
      type: "ref",
      description: "Ссылка на атрибут (для type: attribute)",
    },
    { name: "control", type: "object", description: "Элемент управления" },
    { name: "action", type: "ref", description: "Действие (для type: action)" },
    {
      name: "actions",
      type: "array",
      description: "Массив действий (для type: action)",
    },
    { name: "linkage", type: "ref", description: "Связь (для type: linkage)" },
    { name: "side", type: "enum", description: "Сторона связи: 1 или 2" },
    { name: "label", type: "string", description: "Заголовок виджета" },
  ],
  group: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор группы",
      required: true,
    },
    {
      name: "type",
      type: "enum",
      description: "block, form, tab, tabs, resizable_block_pair",
      required: true,
    },
    { name: "description", type: "string", description: "Описание" },
    { name: "label", type: "string", description: "Заголовок группы" },
    { name: "layout", type: "object", description: "Расположение компонентов" },
    { name: "components", type: "array", description: "Компоненты группы" },
    {
      name: "inherits",
      type: "ref",
      description: "Наследование от другой группы",
    },
  ],
  mixin: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор примеси",
      required: true,
    },
    {
      name: "type",
      type: "enum",
      description: "linkage или view",
      required: true,
    },
    { name: "name", type: "string", description: "Название примеси" },
    { name: "description", type: "string", description: "Описание" },
    { name: "entity", type: "ref", description: "Целевая сущность" },
    {
      name: "weight",
      type: "number",
      description: "Приоритет (меньше — выше)",
    },
    {
      name: "useForChild",
      type: "boolean",
      description: "Наследовать дочерним сущностям (по умолчанию true)",
    },
    { name: "linkage", type: "ref", description: "Связь (для type: linkage)" },
    {
      name: "views",
      type: "array",
      description: "Подмешиваемые представления",
    },
  ],
  sequence: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор последовательности",
      required: true,
    },
    {
      name: "startFrom",
      type: "number",
      description: "Начальное значение (по умолчанию 1)",
    },
    { name: "description", type: "string", description: "Описание" },
  ],
  enumValue: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор значения",
      required: true,
    },
    { name: "name", type: "string", description: "Название" },
    { name: "description", type: "string", description: "Описание" },
    {
      name: "hidden",
      type: "boolean",
      description: "Скрыть значение из выбора",
    },
  ],
  searchingObject: [
    { name: "attributes", type: "array", description: "Атрибуты для поиска" },
  ],
  sourceObject: [
    {
      name: "type",
      type: "enum",
      description: "operational (база данных системы)",
      required: true,
    },
    {
      name: "entity",
      type: "ref",
      description: "Сущность, чьи объекты отображаются",
      required: true,
    },
    {
      name: "joins",
      type: "array",
      description: "Связи для отображения данных",
    },
  ],
};

interface SnippetDef {
  prefix: string;
  description: string;
  contexts: string[];
  body: string;
}

const SNIPPETS: SnippetDef[] = [
  {
    prefix: "newentity",
    description: "Новая сущность",
    contexts: ["entityList", "entity"],
    body: [
      "- id: ${1:NewEntity}",
      "  name: ${2:Новая сущность}",
      '  label: "{${3:id}}"',
      "  description: ${4:Описание сущности}",
      "  attributes:",
      "    - id: ${5:name}",
      "      name: ${6:Имя}",
      "      dataType: String",
    ].join("\n"),
  },
  {
    prefix: "newattr",
    description: "Новый атрибут",
    contexts: ["attributeList", "attribute"],
    body: [
      "- id: ${1:attrId}",
      "  name: ${2:Новый атрибут}",
      "  description: ${3:Описание атрибута}",
      "  dataType: ${4:String}",
    ].join("\n"),
  },
  {
    prefix: "newref",
    description: "Атрибут-референс",
    contexts: ["attributeList", "attribute"],
    body: [
      "- id: ${1:refAttr}",
      "  name: ${2:Ссылка на сущность}",
      "  dataType: Reference",
      "  entity: ${3:TargetEntity}",
    ].join("\n"),
  },
  {
    prefix: "newarr",
    description: "Атрибут-массив",
    contexts: ["attributeList", "attribute"],
    body: [
      "- id: ${1:arrayAttr}",
      "  name: ${2:Массив}",
      "  dataType: Array",
      "  item:",
      "    dataType: ${3:String}",
    ].join("\n"),
  },
  {
    prefix: "newlinkage",
    description: "Новая связь",
    contexts: ["linkageList", "linkage"],
    body: [
      "- id: ${1:EntityA_EntityB}",
      "  name: ${2:Связь сущностей}",
      "  side1: ${3:EntityA}",
      "  side2: ${4:EntityB}",
      "  type: ${5:1_n}",
      "  undirected: ${6:false}",
      "  nameFrom:",
      "    side1: ${7:Содержит}",
      "    side2: ${8:Входит в}",
    ].join("\n"),
  },
  {
    prefix: "newrule",
    description: "Правило данных",
    contexts: ["dataRuleList", "dataRule"],
    body: [
      "- id: ${1:dataR_newRule}",
      "  name: ${2:Новое правило}",
      "  target: entity",
      "  entity: ${3:SomeEntity}",
      "  condition: !rql ${4:someAttr IS NOT NULL}",
      "  rule:",
      "    effect: ${5:required}",
      "    attributes:",
      "      - attribute: ${6:targetAttr}",
    ].join("\n"),
  },
  {
    prefix: "newaction",
    description: "Действие открытия модалки",
    contexts: ["actionList", "action"],
    body: [
      "- id: ${1:actions_newAction}",
      "  name: ${2:Новое действие}",
      "  type: open_modal",
      "  modal: ${3:forms_newModal}",
      "  entity: ${4:SomeEntity}",
      "  operation: create",
    ].join("\n"),
  },
];

// ============ Определение контекста ============

function detectContextAtPosition(
  model: any,
  position: any,
  _lineContexts: Map<number, any>,
): string | null {
  const lineText = model.getLineContent(position.lineNumber);
  const beforeCursor = lineText.slice(0, position.column - 1);

  // Если пользователь уже набрал `key: value` — это значение, не поле
  if (/^\s*(?:-\s+)?[a-zA-Z_][\w]*\s*:\s+\S/.test(beforeCursor)) return null;
  if (/^\s*#/.test(beforeCursor)) return null;

  const currentIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;

  // ============ 1. Определяем section (верхний уровень, indent 0) ============
  let section = "";
  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const pl = model.getLineContent(i);
    const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;
    if (pIndent === 0) {
      const m = pl.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (m) {
        section = m[1];
        break;
      }
    }
  }

  // ============ 2. Определяем ближайшего родителя ============
  let parentKey: string | null = null;
  let parentIndent = -1;
  let parentLine = -1;

  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const pl = model.getLineContent(i);
    if (!pl.trim() || pl.trim().startsWith("#")) continue;
    const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;
    if (pIndent >= currentIndent) continue;

    const keyMatch = pl.match(/^\s*(?:-\s+)?([a-zA-Z_][\w]*)\s*:/);
    if (keyMatch) parentKey = keyMatch[1];
    else if (/^\s*-\s+id\s*:/.test(pl)) parentKey = "id";
    else continue;
    parentIndent = pIndent;
    parentLine = i;
    break;
  }

  if (!parentKey) return null;

  // ============ 3. Секции верхнего уровня ============
  const hasDash = /^\s*-\s*[a-zA-Z]*$/.test(beforeCursor);

  if (parentKey === "entities") return hasDash ? "entity" : "entityList";
  if (parentKey === "linkages") return hasDash ? "linkage" : "linkageList";
  if (parentKey === "actions") return hasDash ? "action" : "actionList";
  if (parentKey === "dataRules") return hasDash ? "dataRule" : "dataRuleList";
  if (parentKey === "views") return hasDash ? "view" : "viewList";
  if (parentKey === "mixins") return hasDash ? "mixin" : "mixinList";
  if (parentKey === "menus") return hasDash ? "menu" : "menuList";
  if (parentKey === "dataTypes") return hasDash ? "dataType" : "dataTypeList";
  if (parentKey === "sequences") return hasDash ? "sequence" : "sequenceList";
  if (parentKey === "medias") return hasDash ? "media" : "mediaList";
  if (parentKey === "counterColorPattern") return "counterColorPattern";

  // ============ 4. Вложенные контейнеры ============
  if (parentKey === "attributes") {
    return section === "linkages" ? "linkageAttribute" : "attribute";
  }
  if (parentKey === "constraints") return "constraintsItem";
  if (parentKey === "item") return "arrayItem";
  if (parentKey === "calculation") return "calculation";
  if (parentKey === "prefixRules") return "prefixRule";
  if (parentKey === "sorting") return "sortingItem";
  if (parentKey === "by") return "sortingByItem";
  if (parentKey === "identification") return "identificationItem";
  if (parentKey === "reconciliation") return "reconciliationItem";
  if (parentKey === "projection") return "projectionItem";
  if (parentKey === "nameFrom") return "nameFrom";
  if (parentKey === "control") return "widgetControl";
  if (parentKey === "table") return "tableConfig";
  if (parentKey === "values") return "enumValue";
  if (parentKey === "statuses") return "workflowStatus";
  if (parentKey === "transitions") return "transition";
  if (parentKey === "items" && section === "menus") return "menuItem";
  if (parentKey === "widgets") return "widget";
  if (parentKey === "groups") return "group";
  if (parentKey === "rule") {
    return section === "dataRules" ? "dataRuleRule" : "identificationRule";
  }

  // ============ 5. Внутри `- id: ...` — определяем по section и наличию attributes выше ============
  if (parentKey === "id") {
    // Ищем `attributes:` выше — идём до начала сущности (предыдущий `- id:` с меньшим indent)
    for (let i = parentLine - 1; i >= 1; i--) {
      const l = model.getLineContent(i);
      if (!l.trim() || l.trim().startsWith("#")) continue;
      const lIndent = (l.match(/^(\s*)/) || ["", ""])[1].length;

      if (/^\s*attributes\s*:/.test(l) && lIndent < parentIndent) {
        return section === "linkages" ? "linkageAttribute" : "attribute";
      }
      if (/^\s*- id\s*:/.test(l) && lIndent < parentIndent) break;
      if (lIndent === 0) break;
    }

    // Не нашли attributes — это сама сущность / связь / действие
    if (section === "entities") return "entity";
    if (section === "linkages") return "linkage";
    if (section === "actions") return "action";
    if (section === "dataRules") return "dataRule";
    if (section === "views") return "view";
    if (section === "mixins") return "mixin";
    if (section === "sequences") return "sequence";
    if (section === "dataTypes") return "dataType";
  }

  return null;
}

// ============ Хелпер для поля/сниппета ============

function buildFieldSuggestion(monaco: any, field: FieldDef, range: any): any {
  const isRequired = field.required === true;
  return {
    label: field.name,
    kind: monaco.languages.CompletionItemKind.Field,
    insertText: field.name,
    filterText: field.name,
    sortText: (isRequired ? "0_" : "1_") + field.name,
    detail: `${field.type}${isRequired ? " · required" : ""}`,
    documentation: field.description,
    range,
  };
}

function buildSnippetSuggestion(
  monaco: any,
  snippet: SnippetDef,
  range: any,
  currentIndent: string,
  hasDash: boolean,
): any {
  let body = snippet.body;
  if (hasDash && body.startsWith("- ")) {
    body = body.slice(2);
  }

  const lines = body.split("\n");
  const insertText = lines.map((line) => currentIndent + line).join("\n");

  return {
    label: `✨ ${snippet.prefix}`,
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText,
    insertTextRules:
      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    filterText: snippet.prefix,
    sortText: "0_" + snippet.prefix,
    detail: snippet.description,
    documentation: `Snippet: ${snippet.description}`,
    range,
  };
}

export function registerMonacoProviders(monaco: any): void {
  if (providersRegistered) return;
  providersRegistered = true;

  // === Регистрируем прямую команду для Quick Fix (обходит баг WorkspaceEdit) ===
  if (!(monaco.editor as any).__dgApplyEditRegistered) {
    (monaco.editor as any).__dgApplyEditRegistered = true;
    monaco.editor.registerCommand(
      "dg-apply-edit",
      (_accessor: any, args: any) => {
        const editors = monaco.editor.getEditors();
        if (!editors || editors.length === 0) return;
        const editor = editors.find((e: any) => e.hasTextFocus()) || editors[0];
        if (!editor) return;

        editor.executeEdits("quickfix", [
          {
            range: {
              startLineNumber: args.startLineNumber,
              startColumn: args.startColumn,
              endLineNumber: args.endLineNumber,
              endColumn: args.endColumn,
            },
            text: args.text,
          },
        ]);
        editor.focus();
      },
    );
  }

  monaco.languages.registerDocumentSymbolProvider("yaml", {
    provideDocumentSymbols: (model: any) => {
      if (!ctx.lineMap) return [];
      try {
        return buildSymbols(monaco, ctx.lineMap);
      } catch {
        return [];
      }
    },
  });

  monaco.languages.registerDefinitionProvider("yaml", {
    provideDefinition: (model: any, position: any) =>
      provideDefinition(monaco, model, position),
  });

  monaco.languages.registerHoverProvider("yaml", {
    provideHover: (model: any, position: any) => {
      try {
        if (!ctx.lineMap || !ctx.modelIndex) return null;
        const lineText = model.getLineContent(position.lineNumber);
        const hit = findWordAtLine(lineText, position.column);
        if (!hit) return null;

        const buildRange = () => ({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: lineText.length + 1,
        });

        // ========== dataType — превью типа данных ==========
        if (hit.type === "ref-datatype") {
          const dt = ctx.modelIndex.dataTypes.find(
            (d: any) => d.id === hit.value,
          );
          if (!dt) {
            // Не нашли dataType — возможно, это базовый тип
            const base = [
              "String",
              "Integer",
              "Decimal",
              "Float",
              "Bool",
              "Uuid",
              "Timestamp",
              "Date",
              "Time",
              "TimestampRange",
              "Text",
              "MAC",
              "IpAddress",
              "CIDR",
              "URL",
              "Attachment",
              "Identifier",
              "Counter",
              "Calculation",
              "Configuration",
              "Variable",
              "RQL",
              "Automation",
              "Reference",
              "Array",
              "Table",
              "Enum",
              "Workflow",
            ];
            if (base.includes(hit.value)) {
              return {
                range: buildRange(),
                contents: [{ value: `**${hit.value}** — базовый тип` }],
              };
            }
            return null;
          }

          const contents: any[] = [];
          contents.push({
            value: `**${dt.id}**${dt.name && dt.name !== dt.id ? ` — ${dt.name}` : ""}`,
          });
          if (dt.kind) contents.push({ value: `Тип: \`${dt.kind}\`` });
          if (dt.values && dt.values.length > 0) {
            const shown = dt.values.slice(0, 25);
            contents.push({
              value:
                `**Значения** (${dt.values.length}): ` +
                shown.map((v: string) => `\`${v}\``).join(", ") +
                (dt.values.length > 25 ? "…" : ""),
            });
          }
          if (dt.statuses && dt.statuses.length > 0) {
            const shown = dt.statuses.slice(0, 25);
            contents.push({
              value:
                `**Статусы** (${dt.statuses.length}): ` +
                shown.map((v: string) => `\`${v}\``).join(", ") +
                (dt.statuses.length > 25 ? "…" : ""),
            });
          }
          if (dt.columns && dt.columns.length > 0) {
            contents.push({
              value: `**Колонки** (${dt.columns.length}): ${dt.columns.slice(0, 15).join(", ")}`,
            });
          }
          return { range: buildRange(), contents };
        }

        // ========== Все виды ссылок на сущность ==========
        // id-def, ref-entity, ref-item (локальные), ref-fqid-foreign (внешние)
        const isEntityLike =
          hit.type === "id-def" ||
          hit.type === "ref-entity" ||
          hit.type === "ref-item" ||
          hit.type === "ref-fqid-foreign";

        if (isEntityLike) {
          let entity: any = null;

          // Пытаемся найти сущность по нескольким сценариям
          if (hit.fqid) {
            // ref-entity / ref-fqid-foreign — есть полный fqid
            entity = ctx.modelIndex.entitiesByFqid[hit.fqid.toLowerCase()];
          }
          if (!entity) {
            // ref-item (локальная ссылка вроде `inherits: Device`)
            // или id-def
            const currentDomain = (ctx.currentDomainId || "").toLowerCase();
            const candidate = `${currentDomain}/${hit.value}`.toLowerCase();
            entity = ctx.modelIndex.entitiesByFqid[candidate];
          }
          if (!entity) {
            // Последний фоллбэк — ищем по entityId по всем доменам (на случай если ссылка на другой домен без префикса)
            const target = hit.value.toLowerCase();
            entity = (ctx.modelIndex.entities || []).find(
              (e: any) => e.entityId.toLowerCase() === target,
            );
          }

          if (!entity) return null;

          const contents: any[] = [];
          contents.push({
            value: `**${entity.entityId}**${entity.name && entity.name !== entity.entityId ? ` — ${entity.name}` : ""}`,
          });
          if (entity.description) {
            contents.push({ value: entity.description });
          }
          const stats = [`Атрибутов: **${entity.attributes.length}**`];
          if (entity.referencedByInheritance.length > 0) {
            stats.push(`Наследников: ${entity.referencedByInheritance.length}`);
          }
          contents.push({ value: stats.join(" · ") });
          contents.push({ value: `\`${entity.fqid}\`` });

          // Полная цепочка наследования
          const chain: string[] = [];
          let cur: any = entity.inherits
            ? ctx.modelIndex.entitiesByFqid[entity.inherits]
            : null;
          const seen = new Set<string>();
          while (cur && !seen.has(cur.fqid) && chain.length < 10) {
            chain.unshift(cur.entityId);
            seen.add(cur.fqid);
            cur = cur.inherits
              ? ctx.modelIndex.entitiesByFqid[cur.inherits]
              : null;
          }
          if (chain.length > 0) {
            contents.push({
              value: `Наследование: \`${chain.join(" → ")} → ${entity.entityId}\``,
            });
          }

          // Наследники
          const childrenFqids =
            ctx.modelIndex.entityChildrenByFqid[entity.fqid] || [];
          if (childrenFqids.length > 0) {
            const childIds = childrenFqids
              .slice(0, 10)
              .map((f: string) => f.split("/")[1]);
            contents.push({
              value:
                `**Наследники** (${childrenFqids.length}): ` +
                childIds.map((c: string) => `\`${c}\``).join(", ") +
                (childrenFqids.length > 10 ? "…" : ""),
            });
          }

          return { range: buildRange(), contents };
        }

        return null;
      } catch {
        return null;
      }
    },
  });

  // Once — глобальный command
  if (!(monaco.editor as any).__dgCommandRegistered) {
    (monaco.editor as any).__dgCommandRegistered = true;
    monaco.editor.registerCommand(
      "dg-issue-action",
      (_accessor: any, payload: any) => {
        document.dispatchEvent(
          new CustomEvent("dg:issue-action", { detail: payload }),
        );
      },
    );
  }

  monaco.languages.registerCodeActionProvider(
    "yaml",
    {
      provideCodeActions: (model: any, range: any, context: any) => {
        const actions: any[] = [];
        const seenTitles = new Set<string>();
        const addActionOnce = (action: any) => {
          if (seenTitles.has(action.title)) return;
          seenTitles.add(action.title);
          actions.push(action);
        };

        context.markers.forEach((marker: any) => {
          if (marker.source !== "dg-linter") return;

          // 1. Naming: entity-camelcase или attribute-camelcase
          if (marker.message.includes("camelCase")) {
            const isAttribute = marker.message.includes("атрибут");

            const lineText = model.getLineContent(marker.startLineNumber);
            const idMatch = lineText.match(/id:\s*([a-zA-Z0-9_\-]+)/);

            if (idMatch && idMatch[1]) {
              const oldId = idMatch[1];
              const parts = oldId.split(/[_\-]+/);

              const camel = parts
                .map((p: string, idx: number) => {
                  if (idx === 0) {
                    return isAttribute
                      ? p.charAt(0).toLowerCase() + p.slice(1) // attribute: camelCase
                      : p.charAt(0).toUpperCase() + p.slice(1); // entity: PascalCase
                  }
                  return p.charAt(0).toUpperCase() + p.slice(1);
                })
                .join("");

              const startCol = lineText.indexOf(oldId) + 1;
              const endCol = startCol + oldId.length;

              addActionOnce({
                title: `🐫 Переименовать в «${camel}»`,
                kind: "quickfix",
                diagnostics: [marker],
                isPreferred: true,
                command: {
                  id: "dg-apply-edit",
                  title: "Apply",
                  arguments: [
                    {
                      startLineNumber: marker.startLineNumber,
                      startColumn: startCol,
                      endLineNumber: marker.startLineNumber,
                      endColumn: endCol,
                      text: camel,
                    },
                  ],
                },
              });
            }
          }

          // 2. Recommended: entity-label
          if (marker.message.includes("нет label")) {
            const lineContent = model.getLineContent(marker.startLineNumber);
            const indentMatch = lineContent.match(/^(\s*)/);
            const baseIndent = indentMatch ? indentMatch[1] : "";
            const indent = baseIndent + "  ";
            const insertCol = lineContent.length + 1;

            addActionOnce({
              title: `🏷️ Добавить label (по умолчанию)`,
              kind: "quickfix",
              diagnostics: [marker],
              command: {
                id: "dg-apply-edit",
                title: "Apply",
                arguments: [
                  {
                    startLineNumber: marker.startLineNumber,
                    startColumn: insertCol,
                    endLineNumber: marker.startLineNumber,
                    endColumn: insertCol,
                    text: `\n${indent}label: "{id}"`,
                  },
                ],
              },
            });
          }

          // 3. Recommended: entity-description
          if (marker.message.includes("нет description")) {
            const lineContent = model.getLineContent(marker.startLineNumber);
            const indentMatch = lineContent.match(/^(\s*)/);
            const baseIndent = indentMatch ? indentMatch[1] : "";
            const indent = baseIndent + "  ";
            const insertCol = lineContent.length + 1;

            addActionOnce({
              title: `📝 Добавить пустой description`,
              kind: "quickfix",
              diagnostics: [marker],
              command: {
                id: "dg-apply-edit",
                title: "Apply",
                arguments: [
                  {
                    startLineNumber: marker.startLineNumber,
                    startColumn: insertCol,
                    endLineNumber: marker.startLineNumber,
                    endColumn: insertCol,
                    text: `\n${indent}description: ""`,
                  },
                ],
              },
            });
          }

          // Стандартные действия
          addActionOnce({
            title: "📖 Показать справку по правилу",
            kind: "quickfix",
            diagnostics: [marker],
            command: {
              id: "dg-issue-action",
              title: "Show help",
              arguments: [{ action: "help", message: marker.message }],
            },
          });

          addActionOnce({
            title: "🔬 Открыть линтер схем",
            kind: "quickfix",
            diagnostics: [marker],
            command: {
              id: "dg-issue-action",
              title: "Open lint",
              arguments: [{ action: "open-lint", message: marker.message }],
            },
          });
        });

        return { actions, dispose: () => {} };
      },
    },
    {
      providedCodeActionKinds: [
        (monaco.languages as any).CodeActionKind?.QuickFix || "quickfix",
      ],
    },
  );

  monaco.languages.registerCompletionItemProvider("yaml", {
    triggerCharacters: [":", " ", "/", ".", "-"],
    provideCompletionItems: (model: any, position: any) => {
      if (!ctx.modelIndex) return { suggestions: [] };
      const lineText = model.getLineContent(position.lineNumber);
      const beforeCursor = lineText.slice(0, position.column - 1);
      const wordAtPos = model.getWordUntilPosition(position);

      const range = {
        startLineNumber: position.lineNumber,
        startColumn: wordAtPos.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: wordAtPos.endColumn,
      };

      const Kind = monaco.languages.CompletionItemKind;

      // ============ 1. Контекст для значения ============

      // dataType
      if (/(?:\s|^)(?:-\s+)?dataType\s*:\s*[\w]*$/.test(beforeCursor)) {
        const suggestions: any[] = [];
        BASE_DATA_TYPES_COMPLETION.forEach((t) => {
          suggestions.push({
            label: t,
            kind: Kind.Value,
            insertText: t,
            range,
          });
        });
        ctx.modelIndex.dataTypes.forEach((dt: any) => {
          suggestions.push({
            label: dt.id,
            kind:
              dt.kind === "Enum"
                ? Kind.Enum
                : dt.kind === "Workflow"
                  ? Kind.Interface
                  : Kind.Struct,
            insertText: dt.id,
            range,
          });
        });
        return { suggestions };
      }

      // inherits / entity / side1 / side2 / linkage
      if (
        /(?:\s|^)(?:-\s+)?(inherits|entity|side1|side2|linkage)\s*:\s*[\w./]*$/.test(
          beforeCursor,
        )
      ) {
        const currentDomainLower = (ctx.currentDomainId || "").toLowerCase();
        const suggestions: any[] = [];
        ctx.modelIndex.entities.forEach((e: any) => {
          const isCurrent = e.domainId.toLowerCase() === currentDomainLower;
          const insert = isCurrent ? e.entityId : e.fqid;
          suggestions.push({
            label: insert,
            kind: Kind.Class,
            insertText: insert,
            range,
          });
        });
        return { suggestions };
      }

      // ============ 2. Snippets + поля по контексту ============

      const context = detectContextAtPosition(
        model,
        position,
        ctx.lineMap?.lineContexts || new Map(),
      );

      if (!context) return { suggestions: [] };

      const rawIndent = (lineText.match(/^(\s*)/) || ["", ""])[1];
      // Обрезаем до кратного 2 (типичный отступ YAML в R-Vision)
      const currentIndent = "  ".repeat(Math.floor(rawIndent.length / 2));

      const hasDash = /^\s*-/.test(beforeCursor);

      const suggestions: any[] = [];

      // Для сниппетов заменяем ВСЮ строку с колонки 1
      const snippetRange = {
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: wordAtPos.endColumn,
      };

      SNIPPETS.forEach((sn) => {
        if (sn.contexts.includes(context)) {
          suggestions.push(
            buildSnippetSuggestion(
              monaco,
              sn,
              snippetRange,
              currentIndent,
              hasDash,
            ),
          );
        }
      });

      // Поля — заменяют только текущее слово
      const fields = FIELD_DEFINITIONS[context];
      if (fields) {
        fields.forEach((f) => {
          suggestions.push(buildFieldSuggestion(monaco, f, range));
        });
      }

      return { suggestions };
    },
  });
}

export function applyRqlMarkers(monaco: any, model: any): void {
  try {
    const text = model.getValue();
    const lineContexts = ctx.lineMap?.lineContexts || new Map();
    const issues = scanRqlInText(text, lineContexts, ctx.modelIndex);
    const markers = issues.map((p) => ({
      severity:
        p.severity === "error"
          ? monaco.MarkerSeverity.Error
          : monaco.MarkerSeverity.Warning,
      message: `RQL: ${p.message}`,
      startLineNumber: p.line,
      startColumn: p.column,
      endLineNumber: p.line,
      endColumn: p.column + p.length,
      source: "rql-check",
    }));
    monaco.editor.setModelMarkers(model, "rql-check", markers);
  } catch {}
}

/**
 * Подсветка невалидных FQID-ссылок в YAML.
 * Работает только для полей, где ожидается FQID:
 *   inherits, entity, side1, side2, linkage, view, modal, panel,
 *   form, tab, list, page, attribute, item, source.
 *
 * Ошибка — домен не существует.
 * Warning — домен есть, сущности нет.
 */
export function applyFqidMarkers(
  monaco: any,
  model: any,
  index: any,
  currentDomainId: string,
): void {
  try {
    const text = model.getValue();
    const lines = text.split("\n");
    const markers: any[] = [];

    const domainIds = new Set<string>();
    (index?.domains || []).forEach((d: any) =>
      domainIds.add(String(d.id).toLowerCase()),
    );
    const entityFqids = new Set<string>();
    const entityIdsByDomain = new Map<string, Set<string>>();
    (index?.entities || []).forEach((e: any) => {
      const fqid = String(e.fqid).toLowerCase();
      entityFqids.add(fqid);
      const domLower = String(e.domainId).toLowerCase();
      if (!entityIdsByDomain.has(domLower)) {
        entityIdsByDomain.set(domLower, new Set());
      }
      entityIdsByDomain.get(domLower)!.add(String(e.entityId).toLowerCase());
    });

    // Поля, значения которых могут быть FQID-ссылкой на сущность
    const REF_FIELD_PATTERN =
      /^\s*(?:-\s+)?(inherits|entity|side1|side2|linkage|view|modal|panel|form|tab|list|page|attribute|item|source|fromView|addLinksView)\s*:\s*(.+)$/;

    const FQID_IN_VALUE = /([a-z0-9][\w.\-]*\.[a-z0-9][\w.\-]*)\/([\w\-]+)/gi;
    const LOCAL_ENTITY_VALUE = /^([A-Z][\w]*)$/; // CamelCase локальный id

    const currentLower = (currentDomainId || "").toLowerCase();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fieldMatch = line.match(REF_FIELD_PATTERN);
      if (!fieldMatch) continue;

      const rawValue = fieldMatch[2];
      const valueWithoutComment = rawValue.split(" #")[0].trim();

      // Убираем кавычки
      let normalizedValue = valueWithoutComment;
      if (
        (normalizedValue.startsWith('"') && normalizedValue.endsWith('"')) ||
        (normalizedValue.startsWith("'") && normalizedValue.endsWith("'"))
      ) {
        normalizedValue = normalizedValue.slice(1, -1);
      }

      const valueStartInLine = line.indexOf(rawValue);
      const quoteOffset =
        valueWithoutComment.length !== normalizedValue.length ? 1 : 0;

      // ===== Сценарий 1: FQID с доменом =====
      FQID_IN_VALUE.lastIndex = 0;
      let fqidFound = false;
      let m: RegExpExecArray | null;
      while ((m = FQID_IN_VALUE.exec(normalizedValue)) !== null) {
        fqidFound = true;
        const full = m[0];
        const domainPart = m[1];
        const entityPart = m[2];
        const colInValue = m.index + 1;
        const startColumn = valueStartInLine + quoteOffset + colInValue;

        const domainLower = domainPart.toLowerCase();
        const fullLower = full.toLowerCase();

        if (!domainIds.has(domainLower)) {
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            message: `Домен «${domainPart}» не найден в индексе`,
            startLineNumber: i + 1,
            startColumn,
            endLineNumber: i + 1,
            endColumn: startColumn + full.length,
            source: "fqid-validator",
          });
        } else if (!entityFqids.has(fullLower)) {
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `Сущность «${entityPart}» не найдена в домене ${domainPart}`,
            startLineNumber: i + 1,
            startColumn,
            endLineNumber: i + 1,
            endColumn: startColumn + full.length,
            source: "fqid-validator",
          });
        }
      }

      // ===== Сценарий 2: локальная сущность (без домена) =====
      // Для inherits/entity — проверяем существование в текущем домене
      if (!fqidFound && currentLower) {
        const field = fieldMatch[1];
        // Только для полей, где значение — это entity id
        if (
          field === "inherits" ||
          field === "entity" ||
          field === "side1" ||
          field === "side2"
        ) {
          // Может быть как чистый id, так и CamelCase
          if (LOCAL_ENTITY_VALUE.test(normalizedValue)) {
            const localSet = entityIdsByDomain.get(currentLower);
            if (localSet && !localSet.has(normalizedValue.toLowerCase())) {
              const startColumn = valueStartInLine + quoteOffset + 1;
              markers.push({
                severity: monaco.MarkerSeverity.Warning,
                message: `Сущность «${normalizedValue}» не найдена в домене ${currentDomainId}`,
                startLineNumber: i + 1,
                startColumn,
                endLineNumber: i + 1,
                endColumn: startColumn + normalizedValue.length,
                source: "fqid-validator",
              });
            }
          }
        }
      }
    }

    monaco.editor.setModelMarkers(model, "fqid-validator", markers);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[fqid-validator]", err);
  }
}
