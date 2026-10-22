import { ModelIndex } from "../../../shared/model-types";
import {
  type LineMap,
  type SectionBlock,
  type NavNode,
  findAttributeInEntity,
} from "../yaml/line-map";
import { scanRqlInText } from "./rql-check";

import type {
  DomainSchemaAllViewItem,
  ViewElementRef,
} from "../../../shared/model-types";

/**
 * Системные атрибуты, доступные для reference-полей
 * (sorting, searching, projection, identification, reconciliation,
 *  attribute-виджеты, колонки таблиц).
 * Источник: «Системные атрибуты» из «Структура схемы домена».
 */
const SYSTEM_ATTRIBUTES_FOR_COMPLETION: Array<{
  id: string;
  dataType: string;
  description: string;
}> = [
  { id: "id", dataType: "Uuid", description: "Идентификатор объекта" },
  {
    id: "label",
    dataType: "String",
    description: "Лейбл объекта (человекочитаемый)",
  },
  { id: "version", dataType: "Integer", description: "Версия объекта" },
  { id: "createdAt", dataType: "Timestamp", description: "Дата создания" },
  { id: "createdBy", dataType: "Reference", description: "Создатель" },
  { id: "updatedAt", dataType: "Timestamp", description: "Дата изменения" },
  { id: "updatedBy", dataType: "Reference", description: "Изменивший" },
  { id: "organizationId", dataType: "Reference", description: "Организация" },
  { id: "tenantId", dataType: "Reference", description: "Тенант" },
  { id: "domainId", dataType: "String", description: "Идентификатор домена" },
  { id: "entityId", dataType: "String", description: "Идентификатор сущности" },
  { id: "entityName", dataType: "String", description: "Название сущности" },
];

/**
 * Возвращает текущее значение `type:` у action-блока, в котором находится
 * строка `currentLineIdx` (1-based). Не важно, где именно `type:` —
 * выше или ниже `operation:`/`page:`.
 *
 * Возвращает null, если action не найден или `type:` в блоке отсутствует.
 */
function findActionTypeForLine(
  lines: string[],
  currentLineIdx: number,
): string | null {
  if (currentLineIdx < 1 || currentLineIdx > lines.length) return null;

  const currentLine = lines[currentLineIdx - 1];
  const currentIndent = (currentLine.match(/^(\s*)/) || ["", ""])[1].length;

  // 1. Находим начало action-блока: ближайший `- <key>:` с indent < currentIndent
  let actionStart = -1;
  let actionIndent = -1;
  for (let i = currentLineIdx - 2; i >= 0; i--) {
    const line = lines[i];
    if (!line || !line.trim() || line.trim().startsWith("#")) continue;

    const m = line.match(/^(\s*)-\s+[a-zA-Z_][\w]*\s*:/);
    if (m && m[1].length < currentIndent) {
      actionStart = i;
      actionIndent = m[1].length;
      break;
    }
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind === 0 && !m) break;
  }
  if (actionStart < 0) return null;

  // 2. Ищем `type:` внутри [actionStart + 1, end of action)
  for (let i = actionStart + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;

    // Начало следующего action
    if (/^\s*-\s+[a-zA-Z_][\w]*\s*:/.test(line) && ind <= actionIndent) {
      break;
    }
    // Вышли из секции actions
    if (ind === 0) break;

    const tm = line.match(/^\s*type\s*:\s*["']?([\w.-]+)["']?/);
    if (tm) return tm[1];
  }
  return null;
}

// ============ Принудительное раскрытие details в suggest-widget ============
// В Monaco 0.52.2 виджет suggestion создаётся лениво (при первом показе),
// а опция `showDetails` только разрешает показать панель, не разворачивая её.
// Внутренний метод _setDetailsVisible(true) — единственный способ раскрыть
// панель документации автоматически. Вызывается при каждом suggest.
function ensureSuggestDetailsVisible(): void {
  const w = window as any;
  const editors = w.monaco?.editor?.getEditors?.() ?? [];
  for (const ed of editors) {
    try {
      const ctrl = ed.getContribution?.("editor.contrib.suggestController");
      const widget = (ctrl as any)?.widget?.value;
      if (widget && typeof widget._setDetailsVisible === "function") {
        widget._setDetailsVisible(true);
      }
    } catch {
      /* private API — на всякий случай глотаем */
    }
  }
}

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

interface ValueCtx {
  section: string; // entities | linkages | views | actions | dataTypes | dataRules | uiRules | …
  container: string; // widgets | groups | attributes | views | control | rule | layout | …
  itemType: string; // entity | attribute | linkage | linkageAttribute | view | viewNested |
  // widget | group | action | dataType | dataRule | uiRule | menu | sequence |
  // tree | transitiveLinkage | sorting | sortingByItem | …
}

function makeValues(
  values: string[],
  Kind: any,
  range: any,
  kind: number = Kind.Value,
): { suggestions: any[] } {
  return {
    suggestions: values.map((v) => ({
      label: v,
      kind,
      insertText: v,
      filterText: v,
      sortText: v,
      range,
    })),
  };
}

function makeEntities(
  ctx: ProviderContext,
  Kind: any,
  range: any,
): { suggestions: any[] } {
  const cur = (ctx.currentDomainId || "").toLowerCase();
  const out: any[] = [];
  ctx.modelIndex?.entities?.forEach((e: any) => {
    const isCur = e.domainId.toLowerCase() === cur;
    const insert = isCur ? e.entityId : e.fqid;
    out.push({
      label: insert,
      kind: Kind.Class,
      insertText: insert,
      filterText: insert,
      range,
    });
  });
  return { suggestions: out };
}

function buildRefFieldCompletion(
  model: any,
  position: any,
  fieldName: string, // 'linkage' | 'widget' | 'group' | …
  values: string[], // уже собранный список id (например, текущий домен)
  Kind: any,
): { suggestions: any[] } | null {
  const beforeCursor = model
    .getLineContent(position.lineNumber)
    .slice(0, position.column - 1);
  // матчим только сам ключ; значение — любое
  const m = beforeCursor.match(
    new RegExp(`^(\\s*(?:-\\s+)?${fieldName}\\s*:)`),
  );
  if (!m) return null;

  const startColumn = m[1].length + 1;
  const lineText = model.getLineContent(position.lineNumber);
  const charAtCursor = lineText.charAt(position.column - 1);
  const endColumn =
    charAtCursor === '"' || charAtCursor === "'"
      ? position.column + 1
      : position.column;

  const range = {
    startLineNumber: position.lineNumber,
    startColumn,
    endLineNumber: position.lineNumber,
    endColumn,
  };

  const seen = new Set<string>();
  const out: any[] = [];
  values.forEach((v) => {
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push({
      label: v,
      kind: Kind.Reference,
      insertText: " " + v,
      filterText: v,
      sortText: v,
      range,
    });
  });
  return { suggestions: out };
}

function provideValueCompletions(
  monaco: any,
  model: any,
  position: any,
  beforeCursor: string,
  range: any,
  Kind: any,
): { suggestions: any[] } | null {
  const lineMatch = beforeCursor.match(
    /^(\s*)(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*([\w./:#@$-]*)$/,
  );
  if (!lineMatch) return null;
  const fieldName = lineMatch[2];
  const vctx = detectValueContext(model, position);

  // ============ dataType ============
  // Регекс матчит только сам ключ "dataType:" — дальше может быть что угодно.
  // Фильтрация значения делается Monaco через filterText, а не через regex.
  const dtPrefix = beforeCursor.match(/^(\s*(?:-\s+)?dataType\s*:)/);
  if (dtPrefix) {
    // Range: от символа сразу после ":" до курсора.
    // Это "съедает" любые пробелы между ":" и значением + частично набранный
    // тип + закрывающую кавычку, если курсор стоит перед ней.
    // insertText всегда с ведущим пробелом — поэтому в буфере получится
    // "dataType: <T>" независимо от того, набрал пользователь пробел или нет.
    const startColumn = dtPrefix[1].length + 1;
    const lineText = model.getLineContent(position.lineNumber);
    const charAtCursor = lineText.charAt(position.column - 1);
    const endColumn =
      charAtCursor === '"' || charAtCursor === "'"
        ? position.column + 1
        : position.column;

    const range = {
      startLineNumber: position.lineNumber,
      startColumn,
      endLineNumber: position.lineNumber,
      endColumn,
    };

    const Kind = monaco.languages.CompletionItemKind;
    const mk = (label: string, kind: number, sortText: string) => ({
      label,
      kind,
      insertText: " " + label, // ← ведущий пробел — Fix №1
      filterText: label, // ← чистый фильтр — Fix №2
      sortText,
      range,
    });

    // Контекст: внутри dataTypes[] — только Enum / Table / Workflow
    const inDataTypesSection = (() => {
      for (let i = position.lineNumber - 1; i >= 1; i--) {
        const pl = model.getLineContent(i);
        const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;
        if (pIndent === 0) {
          const m = pl.match(/^([a-zA-Z_][\w]*)\s*:/);
          return m?.[1] === "dataTypes";
        }
      }
      return false;
    })();

    if (inDataTypesSection) {
      return {
        suggestions: ["Enum", "Table", "Workflow"].map((t) =>
          mk(t, Kind.Value, "0_" + t),
        ),
      };
    }

    const suggestions: any[] = [];

    // Base типы — первыми (sortText '0_')
    BASE_DATA_TYPES_COMPLETION.forEach((t) => {
      suggestions.push(mk(t, Kind.Value, "0_" + t));
    });

    // Кастомные типы — только текущего домена, дедуп по id
    const curDomain = (ctx.currentDomainId || "").toLowerCase();
    const seen = new Set<string>();
    ctx.modelIndex?.dataTypes
      .filter((dt: any) => (dt.domainId || "").toLowerCase() === curDomain)
      .forEach((dt: any) => {
        if (!dt?.id || seen.has(dt.id)) return;
        seen.add(dt.id);
        const kind =
          dt.kind === "Enum"
            ? Kind.Enum
            : dt.kind === "Workflow"
              ? Kind.Interface
              : Kind.Struct;
        suggestions.push(mk(dt.id, kind, "1_" + dt.id));
      });

    return { suggestions };
  }

  // ============ type ============
  if (fieldName === "type") {
    const typeMap: Record<string, string[]> = {
      view: [
        "entity",
        "list",
        "tree",
        "tabs_list",
        "dashboard",
        "dashboard_tree",
      ],
      viewNested: ["panel", "modal", "page"],
      widget: [
        "attribute",
        "action",
        "linkage",
        "linkage_list",
        "linked_objects_groups",
        "join",
        "history",
        "runs_history",
        "comments",
        "card",
        "conversation",
        "visualization",
        "calculation",
        "template_editor",
        "addressBook",
      ],
      group: ["block", "form", "tab", "tabs", "resizable_block_pair"],
      action: [
        "open_panel",
        "open_modal",
        "open_page",
        "open_graph_view",
        "open_board_view",
        "open_list",
        "open_tree",
        "open_view",
        "remove",
        "bulk",
        "tree_bulk",
        "set_attribute_value",
        "automation",
        "scenario",
        "generate_qr_code",
        "copy_entity_link",
        "open_external_widget_modal",
      ],
      linkage: ["1_1", "1_n", "n_n"],
      dataType: ["Enum", "Table", "Workflow"],
      tree: ["ordinary", "orderable", "multiparent"],
      viewWidgetControl: [
        "uuid",
        "text",
        "text_area",
        "date",
        "time",
        "timestamp",
        "timestamp_range",
        "integer",
        "decimal",
        "float",
        "integer_slider",
        "decimal_slider",
        "float_slider",
        "bool_text",
        "checkbox",
        "switch",
        "select",
        "level",
        "radio",
        "multi_select",
        "mitre_multi_select",
        "tag_list",
        "tag",
        "ip",
        "mac",
        "cidr",
        "file",
        "link",
        "url",
        "counter",
        "tree_path",
        "drag_drop_area",
        "rql",
        "external",
      ],
      viewWidgetLinkageControl: [
        "select",
        "multi_select",
        "table",
        "list",
        "tree",
      ],
    };
    if (typeMap[vctx.itemType]) {
      return makeValues(typeMap[vctx.itemType], Kind, range);
    }
    return null;
  }

  // ============ effect (dataRules / uiRules) ============
  if (fieldName === "effect") {
    if (vctx.itemType === "dataRuleRule") {
      return makeValues(
        ["hidden", "readonly", "required", "default", "allowed"],
        Kind,
        range,
      );
    }
    if (vctx.itemType === "uiRuleRule") {
      return makeValues(
        [
          "hidden",
          "show",
          "hiddenEmpty",
          "readonly",
          "editable",
          "inherit",
          "variant",
        ],
        Kind,
        range,
      );
    }
  }

  // ============ target ============
  if (fieldName === "target") {
    if (vctx.itemType === "dataRule") {
      return makeValues(["entity", "entityAttribute", "linkage"], Kind, range);
    }
    if (vctx.itemType === "uiRule") {
      return makeValues(
        ["list_view", "entity_view", "entity_attribute"],
        Kind,
        range,
      );
    }
    if (vctx.itemType === "accessRule") {
      return makeValues(
        [
          "entity",
          "action",
          "linkage",
          "any_entity",
          "any_action",
          "any_linkage",
        ],
        Kind,
        range,
      );
    }
  }

  // ============ inherits / entity / side1 / side2 ============
  if (["inherits", "entity", "side1", "side2"].includes(fieldName)) {
    return makeEntities(ctx, Kind, range);
  }

  // ============ linkage — СУЖЕНИЕ К СПИСКУ СВЯЗЕЙ (было: сущности) ============
  if (fieldName === "linkage") {
    const ids = collectSectionIds(ctx, "linkages");
    return makeValues(ids, Kind, range, Kind.Reference);
  }

  // ============ widget — СУЖЕНИЕ К СПИСКУ ВИДЖЕТОВ (было: views) ============
  if (fieldName === "widget") {
    const ids = collectWidgetIds(ctx);
    return makeValues(ids, Kind, range, Kind.Reference);
  }

  // ============ group — СУЖЕНИЕ К СПИСКУ ГРУПП ============
  if (fieldName === "group") {
    const ids = collectGroupIds(ctx);
    return makeValues(ids, Kind, range, Kind.Reference);
  }

  // ============ column — СУЖЕНИЕ К СПИСКУ КОЛОНОК ============
  if (fieldName === "column") {
    const ids = collectColumnIds(ctx);
    return makeValues(ids, Kind, range, Kind.Reference);
  }

  // ============ action ============
  if (fieldName === "action") {
    const ids = collectSectionIds(ctx, "actions");
    return makeValues(ids, Kind, range, Kind.Reference);
  }

  // ============ sequence ============
  if (fieldName === "sequence") {
    const ids = collectSectionIds(ctx, "sequences");
    return makeValues(ids, Kind, range, Kind.Reference);
  }

  // ============ counterColorPattern ============
  if (fieldName === "counterColorPattern") {
    const ids = collectSectionIds(ctx, "counterColorPattern");
    return makeValues(ids, Kind, range, Kind.Reference);
  }

  // ============ view / modal / panel / form ============
  if (
    fieldName === "view" ||
    fieldName === "modal" ||
    fieldName === "panel" ||
    fieldName === "form" ||
    fieldName === "addLinksView"
  ) {
    let filterType: string | undefined;
    if (fieldName === "modal") filterType = "modal";
    else if (fieldName === "panel") filterType = "panel";
    else if (fieldName === "form")
      filterType = "group"; // form — это группа, но по id они в views[] нет; используем фильтр по context
    else if (fieldName === "addLinksView") filterType = "list";
    else if (fieldName === "view") {
      // view: по контексту
      if (vctx.itemType === "menuItem" || vctx.itemType === "menu")
        filterType = "list";
      else if (vctx.itemType === "action") filterType = "list";
    }
    // form — это группы type:form, они лежат в views[].groups[]
    if (fieldName === "form") {
      const out: string[] = [];
      const seen = new Set<string>();
      if (ctx.modelIndex?.viewElementsByDomain) {
        Object.values(ctx.modelIndex.viewElementsByDomain).forEach((byView) => {
          Object.values(byView).forEach((els: any) => {
            (els.groups || []).forEach((g: string) => {
              if (!seen.has(g)) {
                seen.add(g);
                out.push(g);
              }
            });
          });
        });
      }
      return makeValues(out, Kind, range, Kind.Reference);
    }
    const ids = collectSectionIds(ctx, "views", filterType);
    return makeValues(ids, Kind, range, Kind.Reference);
  }

  // ============ menuItem ============
  if (fieldName === "menuItem") {
    const ids = collectSectionIds(ctx, "menus");
    return makeValues(ids, Kind, range, Kind.Reference);
  }

  // ============ mode (transitive search) ============
  if (fieldName === "mode" && vctx.itemType === "transitiveSearch") {
    return makeValues(["entity", "linkage", "both"], Kind, range);
  }

  // ============ direction (с учётом контекста) ============
  if (fieldName === "direction") {
    if (vctx.container === "layout") {
      return makeValues(["column"], Kind, range);
    }
    if (
      vctx.itemType === "sortingByItem" ||
      vctx.container === "by" ||
      vctx.container === "defaults"
    ) {
      return makeValues(["asc", "desc"], Kind, range);
    }
    return null;
  }

  // ============ placement ============
  if (fieldName === "placement") {
    return makeValues(["top", "settings"], Kind, range);
  }

  return null;
}

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

const BASE_DATA_TYPE_DESCRIPTIONS: Record<string, string> = {
  String: "Строка",
  Integer: "Целое число",
  Decimal: "Число с заданной точностью",
  Float: "Число с плавающей точкой",
  Bool: "Логическое значение (true/false)",
  Uuid: "Универсальный уникальный идентификатор",
  Timestamp: "Момент времени",
  Date: "Календарная дата (YYYY-MM-DD)",
  Time: "Время (hh:mm:ss)",
  TimestampRange: "Диапазон моментов времени",
  Text: "Форматированный текст",
  MAC: "MAC-адрес",
  IpAddress: "IP-адрес (IPv4 / IPv6)",
  CIDR: "Адрес подсети с маской",
  URL: "URL-адрес внешнего ресурса",
  Attachment: "Прикреплённый файл",
  Identifier: "Человекочитаемый идентификатор (по шаблону)",
  Counter: "Счётчик времени",
  Calculation: "Результат расчёта по схеме",
  Configuration: "Ссылка на конфигурацию",
  Variable: "Ссылка на переменную",
  RQL: "Настройки фильтрации RQL",
  Automation: "Ссылка на автоматизацию",
  Reference: "Ссылка на сущность",
  Array: "Массив значений",
  Table: "Таблица",
  Enum: "Перечисление (только в dataTypes[])",
  Workflow: "Рабочий процесс (только в dataTypes[])",
};

// ============ GraphView: цвета иконок ============
const GRAPH_VIEW_COLORS: Array<[string, string]> = [
  ["red", "Красный"],
  ["pink", "Розовый"],
  ["lightpink", "Светло-розовый"],
  ["orange", "Оранжевый"],
  ["peach", "Персиковый"],
  ["yellow", "Жёлтый"],
  ["green", "Зелёный"],
  ["lightgreen", "Светло-зелёный"],
  ["turquoise", "Бирюзовый"],
  ["lightblue", "Голубой"],
  ["blue", "Синий"],
  ["violet", "Фиолетовый"],
  ["purple", "Пурпурный"],
  ["grey", "Серый"],
];
const GRAPH_VIEW_COLOR_LABELS: Record<string, string> =
  Object.fromEntries(GRAPH_VIEW_COLORS);

// ============ Reconciliation: стратегии слияния ============
const RECONCILIATION_MERGE_STRATEGIES: Array<[string, string]> = [
  ["replace", "Замена значения"],
  ["array_merge", "Объединение уникальных элементов"],
  ["array_concat", "Конкатенация всех элементов"],
  ["earliest_date", "Выбор самой ранней даты"],
  ["latest_date", "Выбор самой поздней даты"],
];
const RECONCILIATION_MERGE_LABELS: Record<string, string> = Object.fromEntries(
  RECONCILIATION_MERGE_STRATEGIES,
);

const WIDGET_TYPE_DESCRIPTIONS: Record<string, string> = {
  attribute: "Виджет атрибута (просмотр/редактирование значения)",
  action: "Виджет действия (кнопка/меню)",
  linkage: "Виджет связи (просмотр и редактирование связанных объектов)",
  linkage_list: "Список связей",
  linked_objects_groups: "Группировка связанных объектов (таблица)",
  join: "Транзитивная связь (атрибут через цепочку)",
  history: "История изменений (события аудита)",
  runs_history: "История запусков сценариев",
  comments: "Комментарии",
  conversation: "Переписки",
  visualization: "Визуализация (графики/диаграммы/таблица)",
  diagram: "Диаграмма (визуализация агрегированных данных)",
  calculation: "Расчёт по схеме",
  template_editor: "Редактор шаблонов",
  addressBook: "Адресная книга",
};

const ACTION_TYPE_DESCRIPTIONS: Record<string, string> = {
  open_panel: "Открыть панель (компактное представление)",
  open_modal: "Открыть модальное окно (создание/редактирование)",
  open_page: "Открыть полноэкранную карточку",
  open_graph_view: "Открыть диаграмму связей",
  open_board_view: "Открыть доску",
  open_list: "Открыть списочное представление с контекстом",
  open_tree: "Открыть древовидное представление",
  open_view: "Открыть представление без контекста",
  remove: "Удалить объект",
  bulk: "Массовое действие над объектами",
  tree_bulk: "Массовое действие в древовидном представлении",
  set_attribute_value: "Установить значение атрибута",
  automation: "Запустить автоматизацию",
  scenario: "Запустить сценарий/скрипт",
  workflow: "Переключить атрибут в статус рабочего процесса",
  generate_qr_code: "Сгенерировать QR-код",
  copy_entity_link: "Скопировать URL объекта",
  open_external_widget_modal: "Открыть внешний виджет в модальном окне",
};

const EFFECT_DESCRIPTIONS: Record<string, string> = {
  hidden: "Скрыть элементы представления",
  show: "Показать элементы представления (перебивает hidden)",
  hiddenEmpty: "Скрыть, если пусто",
  readonly: "Сделать недоступным для редактирования",
  editable: "Разрешить редактирование (перебивает readonly)",
  inherit: "Наследовать правило из родителя",
  variant: "Применить вариант оформления (пресеты)",
  required: "Сделать обязательным для заполнения",
  default: "Использовать значение по умолчанию",
  allowed: "Ограничить список допустимых значений",
};

const TARGET_DESCRIPTIONS: Record<string, string> = {
  entity: "Сущность (её атрибуты и связи)",
  entityAttribute: "Элементы массива или атрибуты таблицы",
  linkage: "Связь и её атрибуты",
  list_view: "Списочное представление",
  entity_view: "Представление сущности (компактное/модальное/полноэкранное)",
  entity_attribute: "Колонки таблиц / элементы массивов",
};

const CONTROL_TYPE_DESCRIPTIONS: Record<string, string> = {
  text: "Однострочное текстовое поле",
  text_area: "Многострочное текстовое поле",
  select: "Выпадающий список",
  radio: "Радиокнопки",
  tag: "Тег",
  level: "Индикатор уровня",
  switch: "Переключатель",
  checkbox: "Чекбокс",
  bool_text: "Текст вместо true/false",
  timestamp: "Дата-время",
  date: "Дата",
  time: "Время",
  tree_path: "Путь в дереве",
  drag_drop_area: "Область перетаскивания файлов",
  file: "Кнопка выбора файла",
  slider: "Ползунок",
  link: "Ссылка",
  uuid: "UUID-поле",
  mac: "MAC-адрес",
  ip: "IP-адрес",
  cidr: "CIDR-адрес",
  counter: "Счётчик времени",
  multi_select: "Мультивыбор",
  table: "Таблица",
  list: "Список",
  tree: "Дерево",
  rql: "Редактор RQL",
  integer: "Целочисленное поле",
  decimal: "Число фиксированной точности",
  float: "Число с плавающей точкой",
  integer_slider: "Ползунок для целых чисел",
  decimal_slider: "Ползунок для чисел фикс. точности",
  float_slider: "Ползунок для чисел с плавающей точкой",
  timestamp_range: "Диапазон дата-время",
  mitre_multi_select: "Мультивыбор из справочника MITRE ATT&CK",
  tag_list: "Множество значений",
  url: "URL-адрес",
  external: "Внешний виджет",
};

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

const BOOLEAN_FIELD_NAMES = new Set<string>([
  "readonly",
  "hidden",
  "searchable",
  "useForSearch",
  "undirected",
  "enable",
  "enabled",
  "expandable",
  "scanTarget",
  "scanTargetGroup",
  "isMixin",
  "useForChild",
  "createZeroRecord",
  "contextPin",
  "ordering",
  "selection",
]);

// ============ Хелперы для value-completion ============

interface RefSuggestion {
  label: string;
  insertText: string;
  kind: number;
  sortText: string;
  detail?: string;
  documentation?: string;
}

interface SectionRef {
  id: string;
  domainId: string;
  type?: string;
  kind?: string;
  description?: string;
}

function buildSectionItemDescription(
  sectionKey: string,
  it: any,
  ctx: ProviderContext,
  domainId: string,
): string {
  switch (sectionKey) {
    case "entities": {
      const fqid = `${domainId}/${it.id}`.toLowerCase();
      const e = ctx.modelIndex?.entitiesByFqid?.[fqid];
      if (e) {
        const parts: string[] = [];
        if (e.name && e.name !== e.entityId) parts.push(e.name);
        if (e.description) parts.push(e.description);
        parts.push(`${e.attributes.length} атрибутов`);
        if (e.inherits) parts.push(`↳ ${e.inherits.split("/").pop()}`);
        return parts.join(" · ");
      }
      return it.name || "";
    }
    case "linkages": {
      const parts: string[] = [];
      if (it.name && it.name !== it.id) parts.push(it.name);
      if (it.type) parts.push(`тип ${it.type}`);
      if (it.side1 && it.side2) {
        parts.push(
          `${it.side1.split("/").pop()} ${it.undirected ? "↔" : "→"} ${it.side2.split("/").pop()}`,
        );
      }
      return parts.join(" · ");
    }
    case "actions": {
      const parts: string[] = [];
      if (it.name && it.name !== it.id) parts.push(it.name);
      if (it.type) parts.push(`тип ${it.type}`);
      return parts.join(" · ");
    }
    case "views": {
      const parts: string[] = [];
      if (it.label && it.label !== it.id) parts.push(it.label);
      if (it.type) parts.push(`тип ${it.type}`);
      if (it.entity) parts.push(`→ ${it.entity.split("/").pop()}`);
      if (it.isMixin) parts.push("mixin");
      return parts.join(" · ");
    }
    case "menus": {
      const parts: string[] = [];
      if (it.label && it.label !== it.id) parts.push(it.label);
      if (it.route) parts.push(it.route);
      if (it.type) parts.push(`тип ${it.type}`);
      return parts.join(" · ");
    }
    case "uiPresets": {
      const parts: string[] = [];
      if (it.description) parts.push(it.description);
      if (it.name && it.name !== it.id) parts.push(it.name);
      return parts.join(" · ");
    }
    case "sequences": {
      return `начинается с ${it.startFrom ?? 1}`;
    }
    case "counterColorPattern": {
      const parts: string[] = [];
      if (it.yellow) parts.push(`yellow: ${it.yellow}`);
      if (it.red) parts.push(`red: ${it.red}`);
      return parts.join(" · ");
    }
    case "trees": {
      const parts: string[] = [];
      if (it.name && it.name !== it.id) parts.push(it.name);
      if (it.type) parts.push(`тип ${it.type}`);
      if (it.rootEntity)
        parts.push(`корень: ${it.rootEntity.split("/").pop()}`);
      return parts.join(" · ");
    }
    default:
      return it.name || it.description || "";
  }
}

function collectSectionRefs(
  ctx: ProviderContext,
  sectionKey: string,
): SectionRef[] {
  const out: SectionRef[] = [];
  if (!ctx.modelIndex?.schemasByDomain) return out;
  for (const [domainId, schema] of Object.entries(
    ctx.modelIndex.schemasByDomain,
  ) as Array<[string, any]>) {
    const sec = schema?.sections?.[sectionKey];
    if (!sec?.items) continue;
    for (const it of sec.items) {
      if (!it?.id) continue;
      out.push({
        id: String(it.id),
        domainId,
        type: it.type,
        kind: it.kind,
        description: buildSectionItemDescription(sectionKey, it, ctx, domainId),
      });
    }
  }
  return out;
}

function collectViewRefs(ctx: ProviderContext): SectionRef[] {
  const out: SectionRef[] = [];
  if (!ctx.modelIndex?.schemasByDomain) return out;
  for (const [domainId, schema] of Object.entries(
    ctx.modelIndex.schemasByDomain,
  ) as Array<[string, any]>) {
    const all: DomainSchemaAllViewItem[] | undefined = schema?.allViews;
    if (Array.isArray(all)) {
      for (const v of all) {
        const parts: string[] = [];
        if (v.type) parts.push(v.type);
        if (v.entity) parts.push(`→ ${v.entity.split("/").pop()}`);
        if (v.parentViewId) parts.push(`в ${v.parentViewId}`);
        out.push({
          id: String(v.id),
          domainId,
          type: v.type,
          description: parts.join(" · "),
        });
      }
    } else {
      const sec = schema?.sections?.views;
      if (!sec?.items) continue;
      for (const v of sec.items) {
        const parts: string[] = [];
        if (v.label && v.label !== v.id) parts.push(v.label);
        if (v.type) parts.push(v.type);
        if (v.entity) parts.push(`→ ${v.entity.split("/").pop()}`);
        if (v.isMixin) parts.push("mixin");
        out.push({
          id: String(v.id),
          domainId,
          type: v.type,
          description: parts.join(" · "),
        });
      }
    }
  }
  return out;
}

function pickDescription(
  ref: ViewElementRef | undefined,
  fallbackType: string,
  fallbackView: string,
): string {
  if (ref?.description && ref.description.trim()) {
    const parts: string[] = [ref.description.trim()];
    if (ref.type) parts.push(`тип ${ref.type}`);
    parts.push(`в ${fallbackView}`);
    return parts.join(" · ");
  }
  const parts: string[] = [];
  if (fallbackType || ref?.type) parts.push(`тип ${fallbackType || ref?.type}`);
  parts.push(`в ${fallbackView}`);
  return parts.join(" · ");
}

function collectWidgetRefs(ctx: ProviderContext): SectionRef[] {
  const out: SectionRef[] = [];
  const seen = new Set<string>();
  if (!ctx.modelIndex?.viewElementsByDomain) return out;
  for (const [domainId, byView] of Object.entries(
    ctx.modelIndex.viewElementsByDomain,
  ) as Array<[string, Record<string, any>]>) {
    for (const [viewId, view] of Object.entries(byView)) {
      const typed: ViewElementRef[] | undefined = view?.widgetsWithType;
      if (Array.isArray(typed)) {
        for (const w of typed) {
          if (!w?.id) continue;
          const key = `${domainId}|${w.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            id: String(w.id),
            domainId,
            type: w.type,
            description: pickDescription(w, w.type, viewId),
          });
        }
      } else if (Array.isArray(view?.widgets)) {
        for (const wid of view.widgets) {
          const key = `${domainId}|${wid}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            id: String(wid),
            domainId,
            description: `в ${viewId}`,
          });
        }
      }
    }
  }
  return out;
}

function collectGroupRefs(ctx: ProviderContext): SectionRef[] {
  const out: SectionRef[] = [];
  const seen = new Set<string>();
  if (!ctx.modelIndex?.viewElementsByDomain) return out;
  for (const [domainId, byView] of Object.entries(
    ctx.modelIndex.viewElementsByDomain,
  ) as Array<[string, Record<string, any>]>) {
    for (const [viewId, view] of Object.entries(byView)) {
      const typed: ViewElementRef[] | undefined = view?.groupsWithType;
      if (Array.isArray(typed)) {
        for (const g of typed) {
          if (!g?.id) continue;
          const key = `${domainId}|${g.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            id: String(g.id),
            domainId,
            type: g.type,
            description: pickDescription(g, g.type, viewId),
          });
        }
      } else if (Array.isArray(view?.groups)) {
        for (const gid of view.groups) {
          const key = `${domainId}|${gid}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            id: String(gid),
            domainId,
            description: `в ${viewId}`,
          });
        }
      }
    }
  }
  return out;
}

function collectColumnRefs(ctx: ProviderContext): SectionRef[] {
  const out: SectionRef[] = [];
  const seen = new Set<string>();
  if (!ctx.modelIndex?.viewElementsByDomain) return out;
  for (const [domainId, byView] of Object.entries(
    ctx.modelIndex.viewElementsByDomain,
  ) as Array<[string, Record<string, any>]>) {
    for (const [viewId, view] of Object.entries(byView)) {
      const typed: ViewElementRef[] | undefined = view?.columnsWithType;
      if (Array.isArray(typed)) {
        for (const c of typed) {
          if (!c?.id) continue;
          const key = `${domainId}|${c.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            id: String(c.id),
            domainId,
            description: c.description
              ? `${c.description} · в ${viewId}`
              : `колонка в ${viewId}`,
          });
        }
      } else if (Array.isArray(view?.columns)) {
        for (const cid of view.columns) {
          const key = `${domainId}|${cid}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            id: String(cid),
            domainId,
            description: `колонка в ${viewId}`,
          });
        }
      }
    }
  }
  return out;
}

function collectRefsForField(
  items: SectionRef[],
  currentDomainId: string | null,
  opts: { shortKind: number; fqidKind?: number; typeFilter?: string },
): RefSuggestion[] {
  const cur = (currentDomainId || "").toLowerCase();
  const out: RefSuggestion[] = [];
  const seenLocal = new Set<string>();
  const seenForeign = new Set<string>();

  for (const it of items) {
    if (!it?.id) continue;
    if (opts.typeFilter && it.type !== opts.typeFilter) continue;
    const dom = (it.domainId || "").toLowerCase();
    if (!dom || dom === cur) {
      if (seenLocal.has(it.id)) continue;
      seenLocal.add(it.id);
      out.push({
        label: it.id,
        insertText: " " + it.id,
        kind: opts.shortKind,
        sortText: "0_" + it.id,
        documentation: it.description,
      });
    }
  }

  for (const it of items) {
    if (!it?.id) continue;
    if (opts.typeFilter && it.type !== opts.typeFilter) continue;
    const dom = (it.domainId || "").toLowerCase();
    if (!dom || dom === cur) continue;
    const fqid = `${it.domainId}/${it.id}`;
    if (seenForeign.has(fqid)) continue;
    seenForeign.add(fqid);
    out.push({
      label: fqid,
      insertText: " " + fqid,
      kind: opts.fqidKind ?? opts.shortKind,
      sortText: "9_" + fqid,
      detail: `из ${it.domainId}`,
      documentation: it.description,
    });
  }

  return out;
}

interface ValueCtx {
  section: string;
  container: string;
  itemType: string;
}

function detectValueContext(model: any, position: any): ValueCtx {
  const lines: string[] = [];
  const lineCount = model.getLineCount();
  for (let i = 1; i <= lineCount; i++) lines.push(model.getLineContent(i));

  const lineText = lines[position.lineNumber - 1] || "";
  const currentIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;

  // section
  let section = "";
  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const pl = lines[i - 1];
    if (!pl) continue;
    const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;
    if (pIndent === 0) {
      const m = pl.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (m) {
        section = m[1];
        break;
      }
    }
  }

  // container: ближайший не-`id` ключ с меньшим indent
  let container = "";
  let containerLine = -1;
  let containerIndent = -1;
  {
    const dc = determineViewContainer(
      lines,
      position.lineNumber,
      currentIndent,
    );
    container = dc.container;
    containerLine = dc.containerLine;
    containerIndent = dc.containerIndent;
  }

  // stack (для parent lookup внутри computeItemTypeFast)
  const stack: Array<{ indent: number; key: string }> = [];
  for (let i = 1; i < position.lineNumber; i++) {
    const pl = lines[i - 1];
    if (!pl || !pl.trim() || pl.trim().startsWith("#")) continue;
    const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;
    if (pIndent >= containerIndent) continue;
    const m = pl.match(/^\s*(?:-\s+)?([a-zA-Z_][\w]*)\s*:/);
    if (!m) continue;
    while (stack.length && stack[stack.length - 1].indent >= pIndent)
      stack.pop();
    stack.push({ indent: pIndent, key: m[1] });
  }

  const itemType = computeItemTypeFast(
    lines,
    section,
    container,
    containerLine,
    containerIndent,
    stack,
  );

  return { section, container, itemType };
}

/** Monaco рендерит documentation как markdown — экранируем спецсимволы. */
function escapeMd(s: string): string {
  return String(s).replace(/[\\`*_{}\[\]()<>#+\-!|~]/g, "\\$&");
}

/** Собирает `documentation` в формате IMarkdownString. */
function mdDoc(text?: string): { value: string } | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return { value: escapeMd(trimmed) };
}

function buildValueCompletion(
  model: any,
  position: any,
  fieldNames: string[],
  values: RefSuggestion[],
  Kind: any,
): { suggestions: any[] } | null {
  const lineText = model.getLineContent(position.lineNumber);
  const beforeCursor = lineText.slice(0, position.column - 1);

  const fieldAlt = fieldNames
    .map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const re = new RegExp(`^(\\s*(?:-\\s+)?(?:${fieldAlt})\\s*:)`);
  const m = beforeCursor.match(re);
  if (!m) return null;

  const startColumn = m[1].length + 1;
  const charAtCursor = lineText.charAt(position.column - 1);
  const endColumn =
    charAtCursor === '"' || charAtCursor === "'"
      ? position.column + 1
      : position.column;

  const range = {
    startLineNumber: position.lineNumber,
    startColumn,
    endLineNumber: position.lineNumber,
    endColumn,
  };

  return {
    suggestions: values.map((v) => ({
      label: v.label,
      kind: v.kind ?? Kind.Reference,
      insertText: v.insertText,
      filterText: v.label,
      sortText: v.sortText,
      detail: v.detail,
      documentation: mdDoc(v.documentation),
      range,
    })),
  };
}

const mkSimple = (
  vals: string[],
  kind: number,
  descriptions?: Record<string, string>,
): RefSuggestion[] =>
  vals.map((t) => ({
    label: t,
    insertText: " " + t,
    kind,
    sortText: t,
    documentation: descriptions?.[t],
  }));

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

// ============ Хелперы для value-комплита ============

/** Уникальные ID из произвольного набора секций всех доменов. */
function collectSectionIds(
  ctx: ProviderContext,
  sectionKey: string,
  typeFilter?: string,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  if (!ctx.modelIndex?.schemasByDomain) return out;
  Object.values(ctx.modelIndex.schemasByDomain).forEach((s: any) => {
    const sec = s?.sections?.[sectionKey];
    if (!sec?.items) return;
    for (const it of sec.items) {
      if (!it?.id) continue;
      if (typeFilter && it.type !== typeFilter) continue;
      const id = String(it.id);
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  });
  return out;
}

/** Собирает ID всех виджетов из viewElementsByDomain (уникальные). */
function collectWidgetIds(ctx: ProviderContext): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  if (!ctx.modelIndex?.viewElementsByDomain) return out;
  Object.values(ctx.modelIndex.viewElementsByDomain).forEach((byView) => {
    Object.values(byView).forEach((els: any) => {
      (els.widgets || []).forEach((w: string) => {
        if (!seen.has(w)) {
          seen.add(w);
          out.push(w);
        }
      });
    });
  });
  return out;
}

function collectGroupIds(ctx: ProviderContext): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  if (!ctx.modelIndex?.viewElementsByDomain) return out;
  Object.values(ctx.modelIndex.viewElementsByDomain).forEach((byView) => {
    Object.values(byView).forEach((els: any) => {
      (els.groups || []).forEach((g: string) => {
        if (!seen.has(g)) {
          seen.add(g);
          out.push(g);
        }
      });
    });
  });
  return out;
}

function collectColumnIds(ctx: ProviderContext): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  if (!ctx.modelIndex?.viewElementsByDomain) return out;
  Object.values(ctx.modelIndex.viewElementsByDomain).forEach((byView) => {
    Object.values(byView).forEach((els: any) => {
      (els.columns || []).forEach((c: string) => {
        if (!seen.has(c)) {
          seen.add(c);
          out.push(c);
        }
      });
    });
  });
  return out;
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
  nameFrom: [
    {
      name: "side1",
      type: "string",
      description: "Глагольная форма для стороны 1 (например, «блокирует»)",
      required: true,
    },
    {
      name: "side2",
      type: "string",
      description: "Глагольная форма для стороны 2 (например, «блокируется»)",
      required: true,
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
      name: "page",
      type: "enum",
      description:
        "blank — открыть в новом окне, current — в текущем " +
        "(только для open_list / open_tree / open_view)",
    },
    {
      name: "automation",
      type: "object",
      description: "Ссылка на автоматизацию",
    },
    { name: "scenario", type: "string", description: "Сценарий/скрипт" },
    { name: "workerTag", type: "string", description: "Тег воркера сценария" },
    {
      name: "attribute",
      type: "ref",
      description: "(type: workflow) Атрибут типа Workflow",
    },
    {
      name: "transition",
      type: "object",
      description:
        "(type: workflow) Переход в новый статус: { to: <statusId> }",
    },
    {
      name: "params",
      type: "object",
      description:
        "(type: open_external_widget_modal) Параметры внешнего виджета: { widget: <string> }",
    },
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
      description:
        "Условие правила. RQL-выражение с тегом !rql " +
        "(например: !rql @doc.status = 'NEW') или литерал true/false. " +
        "Многострочное — через !rql |",
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
  viewNested: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор карточки",
      required: true,
    },
    {
      name: "type",
      type: "enum",
      description: "panel | modal | page",
      required: true,
    },
    { name: "description", type: "string", description: "Описание" },
    { name: "label", type: "string", description: "Заголовок карточки" },
    {
      name: "inherit",
      type: "ref",
      description: "Наследование от другой карточки",
    },
    { name: "menu", type: "array", description: "Действия в меню (для panel)" },
    { name: "tabs", type: "array", description: "Вкладки (для panel/page)" },
    { name: "footer", type: "array", description: "Нижняя секция (modal)" },
    { name: "onView", type: "array", description: "Действия при открытии" },
    {
      name: "form",
      type: "ref",
      description: "Ссылка на группу form (для modal)",
    },
    {
      name: "buttons",
      type: "array",
      description: "Кнопки submit/close (для modal)",
    },
    {
      name: "menuItem",
      type: "ref",
      description: "Ссылка на пункт меню (для page)",
    },
    {
      name: "actionPanel",
      type: "array",
      description: "Панель действий (для page)",
    },
    { name: "block", type: "ref", description: "Единый блок (для page)" },
    {
      name: "pinnedView",
      type: "object",
      description: "Закреплённый блок (для page)",
    },
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
  // ============ trees ============
  tree: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор дерева (Data ID)",
      required: true,
    },
    {
      name: "type",
      type: "enum",
      description: "ordinary | orderable | multiparent",
    },
    {
      name: "maxDepth",
      type: "number",
      description: "Максимальная вложенность от корня",
    },
    {
      name: "hierarchy",
      type: "object",
      description: "Иерархия сущностей в дереве",
      required: true,
    },
    {
      name: "sorting",
      type: "array",
      description: "Правила сортировки по уровням",
    },
  ],
  treeHierarchy: [
    {
      name: "entity",
      type: "ref",
      description: "Корневая сущность дерева",
      required: true,
    },
    {
      name: "maxInstances",
      type: "number",
      description: "Максимум объектов в корне",
    },
    {
      name: "maxChildren",
      type: "number",
      description: "Максимум дочерних через связь",
    },
    { name: "children", type: "array", description: "Дочерние узлы" },
  ],
  treeChildren: [
    {
      name: "linkage",
      type: "ref",
      description: "Связь между родителем и потомком",
      required: true,
    },
    {
      name: "entity",
      type: "ref",
      description: "Дочерняя сущность",
      required: true,
    },
    {
      name: "maxInstances",
      type: "number",
      description: "Максимум объектов сущности",
    },
    {
      name: "maxChildren",
      type: "number",
      description: "Максимум дочерних через связь",
    },
    {
      name: "side",
      type: "number",
      description: "Сторона связи с родителем (1 или 2)",
    },
    { name: "children", type: "array", description: "Вложенные дочерние узлы" },
  ],
  treeSorting: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор правила",
      required: true,
    },
    { name: "name", type: "string", description: "Название правила" },
    {
      name: "by",
      type: "array",
      description: "Сортировка по сущностям и атрибутам",
      required: true,
    },
  ],
  treeSortingBy: [
    {
      name: "entity",
      type: "ref",
      description: "Сущность, для которой задаётся сортировка",
      required: true,
    },
    {
      name: "by",
      type: "array",
      description: "Атрибуты и направления",
      required: true,
    },
  ],
  treeSortingByBy: [
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут для сортировки",
      required: true,
    },
    {
      name: "direction",
      type: "enum",
      description: "asc или desc (по умолчанию desc)",
    },
  ],

  // ============ transitiveLinkages ============
  transitiveLinkage: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор дерева транзитивных связей",
      required: true,
    },
    {
      name: "entity",
      type: "ref",
      description: "Сущность, для которой строится дерево",
      required: true,
    },
    { name: "description", type: "string", description: "Описание" },
    {
      name: "joins",
      type: "array",
      description: "Список связей в цепочке",
      required: true,
    },
  ],
  transitiveJoin: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор присоединения",
      required: true,
    },
    {
      name: "linkage",
      type: "ref",
      description: "Связь с сущностью",
      required: true,
    },
    { name: "search", type: "object", description: "Настройки поиска по узлу" },
    { name: "joins", type: "array", description: "Следующие связи в цепочке" },
  ],
  transitiveJoinSearch: [
    {
      name: "enable",
      type: "boolean",
      description: "Включить поиск по узлу",
      required: true,
    },
    {
      name: "mode",
      type: "enum",
      description: "entity | linkage | both (по умолчанию both)",
    },
  ],

  // ============ uiRules ============
  uiRule: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор правила (Data ID)",
      required: true,
    },
    { name: "name", type: "string", description: "Название правила" },
    { name: "description", type: "string", description: "Описание" },
    {
      name: "target",
      type: "enum",
      description: "list_view | entity_view | entity_attribute",
      required: true,
    },
    {
      name: "view",
      type: "ref",
      description:
        "Представление, в котором применяются правила (list / entity)",
      required: true,
    },
    {
      name: "context",
      type: "object",
      description: "Контекст применения (views[])",
    },
    {
      name: "condition",
      type: "rql",
      description: "Условие срабатывания (RQL)",
    },
    {
      name: "rule",
      type: "object",
      description: "Описание эффекта правила",
      required: true,
    },
    { name: "message", type: "string", description: "Сообщение пользователю" },
    { name: "help", type: "string", description: "Текст справки" },
  ],
  uiRuleContext: [
    {
      name: "views",
      type: "array",
      description:
        "Список view-id, в которых применяется (необязательно, для entity_view)",
    },
  ],
  uiRuleRule: [
    {
      name: "effect",
      type: "enum",
      description:
        "hidden | show | hiddenEmpty | readonly | editable | inherit | variant",
      required: true,
    },
    {
      name: "widgets",
      type: "array",
      description: "Виджеты, к которым применяется эффект",
    },
    {
      name: "groups",
      type: "array",
      description: "Группы, к которым применяется эффект",
    },
    {
      name: "columns",
      type: "array",
      description: "Колонки списка (для list_view)",
    },
    {
      name: "presets",
      type: "array",
      description: "Пресеты стилей (для effect: variant)",
    },
  ],
  uiRuleWidget: [
    {
      name: "widget",
      type: "ref",
      description: "Идентификатор виджета (View ID)",
      required: true,
    },
    {
      name: "nested",
      type: "object",
      description: "Nested-эффект для Array/Table-виджетов",
    },
    { name: "presets", type: "array", description: "Пресеты стилей" },
  ],
  uiRuleGroup: [
    {
      name: "group",
      type: "ref",
      description: "Идентификатор группы",
      required: true,
    },
    { name: "presets", type: "array", description: "Пресеты стилей" },
  ],
  uiRuleColumn: [
    {
      name: "column",
      type: "ref",
      description: "Идентификатор колонки (View ID)",
      required: true,
    },
    { name: "presets", type: "array", description: "Пресеты стилей" },
  ],
  uiRuleNested: [
    {
      name: "type",
      type: "enum",
      description: "array или table",
      required: true,
    },
    {
      name: "attributes",
      type: "array",
      description: "Колонки таблицы (для type: table)",
    },
    {
      name: "items",
      type: "array",
      description: "Элементы массива (для type: array)",
    },
  ],
  uiRuleNestedAttribute: [
    {
      name: "attribute",
      type: "ref",
      description: "Идентификатор колонки таблицы",
      required: true,
    },
  ],
  uiRuleNestedItem: [
    {
      name: "item",
      type: "string",
      description: "Индекс элемента массива (0, 1, ... или '*')",
      required: true,
    },
  ],

  // ============ uiPresets ============
  uiPreset: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор пресета (Data ID)",
      required: true,
    },
    { name: "description", type: "string", description: "Описание" },
    {
      name: "props",
      type: "object",
      description: "Свойства стиля (color, font-weight, background, ...)",
    },
  ],
  // ============ actions: расширение ============
  actionBulk: [
    {
      name: "operation",
      type: "enum",
      description: "remove | edit | edit_attribute",
      required: true,
    },
    {
      name: "attributes",
      type: "array",
      description: "Атрибуты для массового редактирования (operation: edit)",
    },
    {
      name: "linkages",
      type: "array",
      description: "Связи для массового редактирования (operation: edit)",
    },
    {
      name: "values",
      type: "array",
      description: "Значения атрибутов (operation: edit_attribute)",
    },
    {
      name: "control",
      type: "object",
      description:
        "Настройки bool-поля (operation: edit_attribute + bool-атрибут)",
    },
  ],
  actionBulkAttributes: [
    {
      name: "type",
      type: "enum",
      description: "Всегда specific",
      required: true,
    },
    {
      name: "use",
      type: "array",
      description: "Массив ссылок на атрибуты (attribute: <id>)",
    },
  ],
  actionBulkAttributeUse: [
    {
      name: "attribute",
      type: "ref",
      description: "Data ID Ref атрибута сущности",
      required: true,
    },
  ],
  actionBulkLinkages: [
    {
      name: "type",
      type: "enum",
      description: "Всегда specific",
      required: true,
    },
    {
      name: "use",
      type: "array",
      description: "Массив ссылок на виджеты связей (widget: <id>)",
    },
  ],
  actionBulkLinkageUse: [
    {
      name: "widget",
      type: "ref",
      description: "View ID виджета связи (сторона N)",
      required: true,
    },
  ],
  actionValue: [
    {
      name: "attribute",
      type: "ref",
      description: "Идентификатор атрибута",
      required: true,
    },
    { name: "value", type: "string", description: "Устанавливаемое значение" },
  ],
  actionControl: [
    {
      name: "type",
      type: "string",
      description: "Тип редактора (опционально)",
    },
    {
      name: "trueText",
      type: "string",
      description: "Отображаемый текст для True",
      required: true,
    },
    {
      name: "falseText",
      type: "string",
      description: "Отображаемый текст для False",
      required: true,
    },
  ],
  actionAutomation: [
    {
      name: "id",
      type: "string",
      description: "UUID автоматизации (3c521909-cc55-4b0c-b645-f79eb0263296)",
      required: true,
    },
  ],
  // ============ views: list-view ============
  viewSource: [
    {
      name: "type",
      type: "enum",
      description: "operational (БД системы)",
      required: true,
    },
    {
      name: "entity",
      type: "ref",
      description: "Сущность, чьи объекты отображаются в списке",
      required: true,
    },
    {
      name: "joins",
      type: "array",
      description: "Связи для отображения данных связанных сущностей",
    },
  ],
  viewSourceJoin: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор связи (Data ID)",
      required: true,
    },
    {
      name: "linkage",
      type: "ref",
      description: "Связь с другой сущностью",
      required: true,
    },
    { name: "side", type: "enum", description: "Сторона связи: 1 или 2" },
    { name: "description", type: "string", description: "Описание связи" },
  ],
  viewTable: [
    {
      name: "columns",
      type: "array",
      description: "Столбцы таблицы",
      required: true,
    },
    { name: "filter", type: "object", description: "Настройки фильтрации" },
    { name: "sortingBy", type: "object", description: "Правила сортировки" },
    { name: "paging", type: "object", description: "Пагинация" },
    { name: "refresh", type: "object", description: "Обновление данных" },
    {
      name: "selection",
      type: "boolean",
      description: "Возможность выбора строк",
    },
    {
      name: "actions",
      type: "array",
      description: "Действия при клике на строку",
    },
    { name: "empty", type: "object", description: "Текст при пустой таблице" },
  ],
  viewTableColumn: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор столбца (View ID)",
      required: true,
    },
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут для отображения (Data ID Ref / FQID)",
    },
    {
      name: "label",
      type: "string",
      description: "Отображаемое название столбца",
    },
    {
      name: "layout",
      type: "object",
      description: "Размер и видимость столбца",
    },
    { name: "control", type: "object", description: "Тип редактора в столбце" },
    {
      name: "join",
      type: "ref",
      description: "Транзитивная связь для колонки",
    },
    { name: "use", type: "array", description: "Атрибуты атрибута-таблицы" },
    { name: "aggregate", type: "object", description: "Агрегация (count)" },
    {
      name: "counterColorPattern",
      type: "ref",
      description: "Цветовая схема счётчика",
    },
    {
      name: "actions",
      type: "array",
      description: "Действия при hover на ячейку",
    },
  ],
  viewTableColumnLayout: [
    {
      name: "visible",
      type: "boolean",
      description: "Видимость столбца (по умолчанию true)",
    },
    { name: "width", type: "object", description: "Настройки ширины" },
  ],
  viewTableColumnWidth: [
    {
      name: "default",
      type: "number",
      description: "Ширина по умолчанию (px)",
      required: true,
    },
    {
      name: "min",
      type: "number",
      description: "Минимальная ширина (px)",
      required: true,
    },
    {
      name: "max",
      type: "number",
      description: "Максимальная ширина (px)",
      required: true,
    },
  ],
  viewTableColumnControl: [
    {
      name: "type",
      type: "string",
      description:
        "text | text_area | select | radio | tag | level | bool_text | timestamp | tree_path и др.",
    },
    {
      name: "trueText",
      type: "string",
      description: "Отображаемый текст для True (для bool_text)",
    },
    {
      name: "falseText",
      type: "string",
      description: "Отображаемый текст для False (для bool_text)",
    },
    {
      name: "tree",
      type: "ref",
      description: "Дерево для отображения пути (для type: tree_path)",
    },
  ],
  viewTableColumnAggregate: [
    { name: "type", type: "enum", description: "count", required: true },
    {
      name: "condition",
      type: "rql",
      description: "RQL-условие фильтрации связанных объектов",
    },
  ],
  viewTableFilter: [
    {
      name: "attributes",
      type: "object",
      description: "Фильтрация по атрибутам сущности",
    },
    { name: "linkages", type: "object", description: "Фильтрация по связям" },
  ],
  viewTableFilterAttributes: [
    {
      name: "type",
      type: "enum",
      description: "specific | all",
      required: true,
    },
    {
      name: "use",
      type: "array",
      description: "Массив атрибутов для фильтрации (при type: specific)",
    },
  ],
  viewTableFilterAttributesUse: [
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут для фильтрации",
      required: true,
    },
    { name: "use", type: "array", description: "Атрибуты атрибута-таблицы" },
  ],
  viewTableFilterLinkages: [
    {
      name: "type",
      type: "enum",
      description: "specific | all",
      required: true,
    },
    {
      name: "use",
      type: "array",
      description: "Массив связей для фильтрации (при type: specific)",
    },
  ],
  viewTableFilterLinkagesUse: [
    { name: "linkage", type: "ref", description: "Связь для фильтрации" },
    {
      name: "join",
      type: "ref",
      description: "Транзитивная связь для фильтрации",
    },
    {
      name: "link_attributes",
      type: "array",
      description: "Атрибуты связи для фильтрации",
    },
    {
      name: "linkedEntity",
      type: "array",
      description: "Атрибуты связанной сущности для фильтрации",
    },
  ],
  viewTableSortingBy: [
    {
      name: "columns",
      type: "array",
      description: "Столбцы для сортировки",
      required: true,
    },
    {
      name: "defaults",
      type: "object",
      description: "Сортировка по умолчанию",
    },
  ],
  viewTableSortingByColumn: [
    {
      name: "column",
      type: "ref",
      description: "Столбец (View ID)",
      required: true,
    },
    {
      name: "sorting",
      type: "ref",
      description: "Правило сортировки (Data ID)",
      required: true,
    },
  ],
  viewTableSortingByDefault: [
    {
      name: "column",
      type: "ref",
      description: "Столбец по умолчанию",
      required: true,
    },
    {
      name: "direction",
      type: "enum",
      description: "asc | desc",
      required: true,
    },
  ],
  viewTablePaging: [
    {
      name: "sizes",
      type: "array",
      description: "Варианты количества записей (например, [10, 50, 100])",
      required: true,
    },
    {
      name: "defaultSize",
      type: "number",
      description: "Количество записей по умолчанию",
      required: true,
    },
  ],
  viewTableRefresh: [
    {
      name: "mode",
      type: "enum",
      description: "manual | auto | all",
      required: true,
    },
    {
      name: "defaults",
      type: "object",
      description: "Настройки автообновления",
    },
  ],
  viewTableRefreshDefaults: [
    {
      name: "enabled",
      type: "boolean",
      description: "Автообновление включено",
      required: true,
    },
    {
      name: "unit",
      type: "enum",
      description: "second | minute | hour",
      required: true,
    },
    {
      name: "interval",
      type: "number",
      description: "Интервал в указанных единицах",
      required: true,
    },
  ],
  viewTableAction: [
    {
      name: "type",
      type: "enum",
      description: "row_click | row_double_click | row_context_menu",
      required: true,
    },
    {
      name: "action",
      type: "ref",
      description: "Действие при клике (для row_click, row_double_click)",
    },
    {
      name: "items",
      type: "array",
      description: "Действия контекстного меню (для row_context_menu)",
    },
  ],
  viewTableActionItem: [
    {
      name: "action",
      type: "ref",
      description: "Действие (View ID)",
      required: true,
    },
    { name: "label", type: "string", description: "Отображаемое название" },
    { name: "icon", type: "ref", description: "Иконка (View ID медиа)" },
  ],
  viewTableEmpty: [
    {
      name: "message",
      type: "string",
      description: "Текст при отсутствии данных",
      required: true,
    },
  ],
  // ============ views: entity-view ============
  viewWidgetControl: [
    {
      name: "type",
      type: "string",
      description:
        "Тип редактора: text, text_area, select, radio, tag, level, switch, checkbox, bool_text, timestamp, date, time, tree_path, drag_drop_area, file, slider, link и др.",
    },
    {
      name: "text",
      type: "string",
      description: "Текст области перетаскивания (для drag_drop_area)",
    },
    {
      name: "trueText",
      type: "string",
      description: "Отображаемый текст для True (для bool_text)",
    },
    {
      name: "falseText",
      type: "string",
      description: "Отображаемый текст для False (для bool_text)",
    },
    { name: "step", type: "number", description: "Шаг ползунка (для slider)" },
    {
      name: "icon",
      type: "ref",
      description: "Иконка (для action-виджета, regular_button)",
    },
  ],
  viewWidgetLinkageControl: [
    {
      name: "type",
      type: "enum",
      description: "select | multi_select | table",
      required: true,
    },
    {
      name: "addLinksView",
      type: "ref",
      description:
        "Список для выбора связанных объектов (модалка создания связи)",
    },
    // NEW
    {
      name: "displayMode",
      type: "enum",
      description:
        "flat | grouped — режим отображения (только для транзитивных связей)",
    },
    {
      name: "columns",
      type: "array",
      description: "Столбцы таблицы (только для type: table)",
    },
    { name: "sortingBy", type: "array", description: "Правила сортировки" },
    { name: "paging", type: "object", description: "Пагинация" },
  ],
  viewWidgetLinkageColumn: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор столбца",
      required: true,
    },
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут связанного объекта или связи",
    },
    {
      name: "join",
      type: "ref",
      description: "Транзитивная связь для колонки (нельзя вместе с linkage)",
    },
    {
      name: "linkage",
      type: "ref",
      description: "Связь для колонки (нельзя вместе с join)",
    },
  ],
  viewWidgetLinkageAttributes: [
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут связи",
      required: true,
    },
    { name: "label", type: "string", description: "Название атрибута в UI" },
    { name: "control", type: "object", description: "Элемент управления" },
  ],
  viewWidgetLinkageAttributeControl: [
    {
      name: "type",
      type: "string",
      description: "Тип редактора (соответствует типу данных)",
    },
    {
      name: "view",
      type: "ref",
      description: "Представление выбора сущностей (для Reference)",
    },
    {
      name: "editable",
      type: "boolean",
      description: "Разрешить редактирование (по умолчанию true)",
    },
  ],
  viewWidgetConversation: [
    {
      name: "linkage",
      type: "ref",
      description: "Связь с сущностью Message из domain.comm.rvision.ru",
      required: true,
    },
    {
      name: "conversationTransports",
      type: "array",
      description: "Ограничение доступных транспортов",
    },
  ],
  viewGroupLayout: [
    {
      name: "direction",
      type: "enum",
      description: "column (вертикально) — единственное доступное значение",
    },
    {
      name: "expandable",
      type: "boolean",
      description: "Возможность сворачивания (для block)",
    },
    {
      name: "minHeight",
      type: "string",
      description: "Мин. высота секции (для resizable_block_pair)",
    },
    {
      name: "maxHeight",
      type: "string",
      description: "Макс. высота секции (для resizable_block_pair)",
    },
    {
      name: "sizeRatio",
      type: "object",
      description: "Соотношение ширины секций (для resizable_block_pair)",
    },
  ],
  viewGroupComponent: [
    {
      name: "inherit",
      type: "object",
      description: "Настройки наследования от родительской группы",
    },
    { name: "widget", type: "ref", description: "Ссылка на виджет" },
    { name: "block", type: "ref", description: "Ссылка на вложенный блок" },
  ],
  viewButton: [
    {
      name: "type",
      type: "enum",
      description: "submit | close",
      required: true,
    },
    { name: "label", type: "string", description: "Название кнопки" },
    { name: "control", type: "object", description: "Элемент управления" },
    {
      name: "actions",
      type: "array",
      description: "Действия при сохранении (для type: submit)",
    },
    {
      name: "hidden",
      type: "boolean",
      description: "Скрыть кнопку (для type: submit)",
    },
  ],
  viewButtonControl: [
    {
      name: "type",
      type: "enum",
      description: "regular_button",
      required: true,
    },
    { name: "icon", type: "ref", description: "Иконка кнопки" },
  ],
  viewButtonAction: [
    {
      name: "action",
      type: "ref",
      description: "Действие (только set_attribute_value)",
      required: true,
    },
  ],
  viewMenuAction: [
    {
      name: "action",
      type: "ref",
      description: "Действие (View ID)",
      required: true,
    },
    {
      name: "inherit",
      type: "object",
      description: "Настройки наследования меню",
    },
  ],
  viewFooterAction: [
    {
      name: "action",
      type: "ref",
      description: "Действие (только automation / scenario)",
      required: true,
    },
    {
      name: "behavior",
      type: "enum",
      description: "run | run_close | run_submit",
      required: true,
    },
    { name: "control", type: "object", description: "Элемент управления" },
  ],
  viewActionPanelItem: [
    {
      name: "widget",
      type: "ref",
      description: "Виджет действия (View ID)",
      required: true,
    },
    { name: "inherit", type: "object", description: "Настройки наследования" },
  ],
  viewTab: [
    {
      name: "tab",
      type: "ref",
      description: "Вкладка (View ID группы типа tab)",
      required: true,
    },
    {
      name: "inherit",
      type: "object",
      description: "Настройки наследования вкладок",
    },
  ],
  viewPinnedView: [
    {
      name: "block",
      type: "ref",
      description: "Закреплённый блок (View ID)",
      required: true,
    },
    { name: "position", type: "enum", description: "top | bottom" },
    {
      name: "minHeight",
      type: "string",
      description: "Мин. высота (например, 25% или 200px)",
    },
    { name: "maxHeight", type: "string", description: "Макс. высота" },
    {
      name: "height",
      type: "string",
      description: "Высота (по умолчанию 30%)",
    },
  ],
  inheritSettings: [
    {
      name: "type",
      type: "enum",
      description: "append | override | except",
      required: true,
    },
    {
      name: "except",
      type: "array",
      description: "Список id для исключения (при type: except)",
    },
  ],
  // ============ menus ============
  menuRoot: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор корневой группы",
      required: true,
    },
    {
      name: "route",
      type: "string",
      description: "Путь в URL (например, /assets)",
      required: true,
    },
    {
      name: "label",
      type: "string",
      description: "Заголовок раздела в меню",
      required: true,
    },
    { name: "description", type: "string", description: "Описание" },
    { name: "icon", type: "ref", description: "Ссылка на медиа-ресурс" },
    {
      name: "type",
      type: "enum",
      description: "root_group или root_menu",
      required: true,
    },
    {
      name: "placement",
      type: "enum",
      description: "top (главное меню) или settings (настройки)",
      required: true,
    },
    {
      name: "priority",
      type: "number",
      description: "Приоритет (≥1000, больше = выше)",
    },
    {
      name: "view",
      type: "ref",
      description: "Ссылка на представление (для root_menu)",
    },
    { name: "items", type: "array", description: "Дочерние элементы меню" },
  ],
  menuItem: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор пункта",
      required: true,
    },
    {
      name: "route",
      type: "string",
      description: "Путь в URL (после пути раздела)",
      required: true,
    },
    {
      name: "label",
      type: "string",
      description: "Заголовок пункта",
      required: true,
    },
    { name: "description", type: "string", description: "Описание" },
    {
      name: "type",
      type: "enum",
      description: "Устанавливается menu",
      required: true,
    },
    {
      name: "view",
      type: "ref",
      description: "Ссылка на представление (список или вкладки)",
      required: true,
    },
    { name: "priority", type: "number", description: "Приоритет (≥1000)" },
  ],

  // ============ medias ============
  media: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор иконки (View ID)",
      required: true,
    },
    { name: "description", type: "string", description: "Описание" },
    { name: "type", type: "enum", description: "icon_name", required: true },
    {
      name: "iconName",
      type: "string",
      description: "Идентификатор в библиотеке иконок",
      required: true,
    },
  ],

  // ============ mixins ============
  mixin: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор примеси",
      required: true,
    },
    { name: "name", type: "string", description: "Наименование примеси" },
    { name: "description", type: "string", description: "Описание" },
    {
      name: "weight",
      type: "number",
      description: "Приоритет (меньше = выше)",
    },
    {
      name: "useForChild",
      type: "boolean",
      description: "Наследовать дочерним сущностям (по умолчанию true)",
    },
    {
      name: "type",
      type: "enum",
      description: "linkage или view",
      required: true,
    },
    {
      name: "entity",
      type: "object",
      description: "Направление примеси (from → to)",
      required: true,
    },
    { name: "linkage", type: "ref", description: "Связь (для type: linkage)" },
    {
      name: "views",
      type: "array",
      description: "Подмешиваемые представления",
      required: true,
    },
  ],
  mixinEntity: [
    {
      name: "from",
      type: "ref",
      description: "Источник примеси (сущность, из которой берутся данные)",
    },
    {
      name: "to",
      type: "ref",
      description: "Целевая сущность (в которую встраивается)",
    },
  ],
  mixinView: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор примеси компонентов",
      required: true,
    },
    {
      name: "type",
      type: "enum",
      description: "form | tab | panel | page | list",
      required: true,
    },
    {
      name: "fromView",
      type: "ref",
      description: "Источник компонентов (для type: view)",
    },
    {
      name: "to",
      type: "object",
      description: "Целевое представление",
      required: true,
    },
    {
      name: "change",
      type: "object",
      description: "Изменения целевого представления (add / delete)",
    },
    {
      name: "replace",
      type: "object",
      description: "Замена компонентов (для type: view)",
    },
  ],
  mixinViewTo: [
    {
      name: "panel",
      type: "ref",
      description: "Целевая панель (для type: panel)",
    },
    {
      name: "tab",
      type: "ref",
      description: "Целевая вкладка (для type: tab)",
    },
    {
      name: "form",
      type: "ref",
      description: "Целевая форма (для type: form)",
    },
    {
      name: "list",
      type: "ref",
      description: "Целевой список (для type: list)",
    },
    {
      name: "page",
      type: "ref",
      description: "Целевая страница (для type: page)",
    },
  ],
  mixinChange: [
    { name: "add", type: "object", description: "Добавляемые компоненты" },
    { name: "delete", type: "object", description: "Удаляемые компоненты" },
  ],
  mixinChangeAdd: [
    {
      name: "components",
      type: "array",
      description: "Виджеты и блоки для добавления",
    },
    {
      name: "tabs",
      type: "object",
      description: "Вкладки для добавления (для type: panel)",
    },
    {
      name: "menu",
      type: "object",
      description: "Действия для добавления в меню",
    },
    {
      name: "form",
      type: "ref",
      description: "Форма для добавления (для type: form)",
    },
    {
      name: "list",
      type: "ref",
      description: "Список для добавления (для type: list)",
    },
    {
      name: "block",
      type: "ref",
      description: "Блок для добавления (для type: page)",
    },
    {
      name: "position",
      type: "object",
      description: "Расположение (begin | after | end)",
    },
  ],
  mixinPosition: [
    {
      name: "type",
      type: "enum",
      description: "begin | after | end (по умолчанию end)",
    },
    {
      name: "after",
      type: "object",
      description: "Компонент, после которого вставлять (для type: after)",
    },
  ],

  // ============ exchangeSettings ============
  exchangeSettings: [
    {
      name: "enable",
      type: "boolean",
      description: "Включить обмен данными для домена (по умолчанию: true)",
    },
    {
      name: "description",
      type: "string",
      description: "Описание требований к обмену",
    },
    {
      name: "label",
      type: "string",
      description: "Название домена в списке импорта/экспорта",
    },
    {
      name: "noCmsSync",
      type: "boolean",
      description: "Отключить sdk.cms.sync для создания/обновления",
    },
    {
      name: "attributeFormats",
      type: "object",
      description: "Форматы Date/Time/Timestamp/TimestampRange (Moment)",
    },
    {
      name: "entities",
      type: "object",
      description: "Настройки обмена по сущностям: { <EntityId>: { ... } }",
    },
  ],
  exchangeAttributeFormats: [
    { name: "Date", type: "string", description: "Формат Date (DD-MM-YYYY)" },
    { name: "Time", type: "string", description: "Формат Time (HH:mm:ss)" },
    {
      name: "Timestamp",
      type: "string",
      description: "Формат Timestamp (DD-MM-YYYYTHH:mm:ss)",
    },
    {
      name: "TimestampRange",
      type: "string",
      description: "Формат TimestampRange",
    },
  ],
  exchangeEntity: [
    {
      name: "domainLabel",
      type: "string",
      description: "Переопределение названия домена для сущности",
    },
    {
      name: "enable",
      type: "boolean",
      description: "Включить обмен для этой сущности",
    },
    {
      name: "label",
      type: "string",
      description: "Название сущности в списке",
    },
    {
      name: "forExport",
      type: "ref",
      description: "Атрибут-идентификатор для Reference",
    },
    {
      name: "upsertWith",
      type: "string",
      description:
        "Атрибуты/связи для идентификации при обновлении (через запятую)",
    },
    {
      name: "ignoreAttributes",
      type: "string",
      description: "Игнорируемые атрибуты (id через запятую)",
    },
    {
      name: "exportSystemAttributes",
      type: "string",
      description: "Системные атрибуты для экспорта (id через запятую) или all",
    },
    {
      name: "noCmsSync",
      type: "boolean",
      description: "Отключить sdk.cms.sync для этой сущности",
    },
  ],
  exchangeEntitySettings: [
    {
      name: "domainLabel",
      type: "string",
      description: "Переопределение отображаемого названия домена",
    },
    {
      name: "enable",
      type: "boolean",
      description: "Включить обмен для этой сущности (по умолчанию true)",
    },
    {
      name: "label",
      type: "string",
      description: "Название сущности в списке",
    },
    {
      name: "forExport",
      type: "ref",
      description: "Атрибут-идентификатор для Reference",
    },
    {
      name: "upsertWith",
      type: "string",
      description: "Атрибуты/связи для идентификации при обновлении",
    },
    {
      name: "ignoreAttributes",
      type: "string",
      description: "Игнорируемые атрибуты (id через запятую)",
    },
    {
      name: "exportSystemAttributes",
      type: "string",
      description: "Системные атрибуты для экспорта (id или all)",
    },
  ],
  attributeConstraint: [
    {
      name: "kind",
      type: "enum",
      description:
        "Вид валидации: required | range | length | regexp | size | mime_types | unique",
      required: true,
    },
    {
      name: "message",
      type: "string",
      description: "Сообщение об ошибке при срабатывании",
    },
    {
      name: "min",
      type: "number",
      description: "Минимум: для range — значение, для length — символов",
    },
    {
      name: "max",
      type: "number",
      description: "Максимум: для range — значение, для length/size — лимит",
    },
    {
      name: "regexp",
      type: "string",
      description: "Регулярное выражение (только для kind: regexp)",
    },
    {
      name: "mimeTypes",
      type: "array",
      description: "Список MIME-типов (только для kind: mime_types)",
    },
  ],

  arrayItem: [
    {
      name: "dataType",
      type: "enum",
      description: "Тип элемента массива (String, Reference, Enum, …)",
      required: true,
    },
    {
      name: "entity",
      type: "ref",
      description: "Целевая сущность (только для dataType: Reference)",
    },
    {
      name: "item",
      type: "object",
      description: "Параметры вложенного массива (для Array)",
    },
    {
      name: "constraints",
      type: "array",
      description: "Ограничения элемента массива",
    },
    {
      name: "calculation",
      type: "object",
      description: "Ссылка на расчёт (для Calculation)",
    },
  ],

  calculation: [
    {
      name: "schemaId",
      type: "string",
      description: "Идентификатор схемы, где определён расчёт",
      required: true,
    },
    {
      name: "id",
      type: "string",
      description: "Идентификатор расчёта",
      required: true,
    },
  ],

  prefixRule: [
    {
      name: "id",
      type: "string",
      description: "Уникальный идентификатор правила",
      required: true,
    },
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут текущей сущности для сравнения",
      required: true,
    },
    {
      name: "source",
      type: "object",
      description: "Источник справочника для подстановки префикса",
      required: true,
    },
  ],

  prefixRuleSource: [
    {
      name: "entity",
      type: "ref",
      description: "Сущность-справочник",
      required: true,
    },
    {
      name: "key",
      type: "ref",
      description: "Атрибут справочника для сравнения",
      required: true,
    },
    {
      name: "value",
      type: "ref",
      description:
        "Атрибут справочника, значение которого станет префиксом (String)",
      required: true,
    },
  ],
  sortingItem: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор правила сортировки",
      required: true,
    },
    { name: "name", type: "string", description: "Название правила" },
    {
      name: "by",
      type: "array",
      description: "Сортируемые атрибуты (attribute + direction)",
      required: true,
    },
    {
      name: "createIndex",
      type: "boolean",
      description: "Создать индекс для сортировки",
    },
  ],

  sortingByItem: [
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут для сортировки",
      required: true,
    },
    {
      name: "direction",
      type: "enum",
      description: "asc — по возрастанию, desc — по убыванию",
    },
  ],

  searchingAttributesItem: [], // здесь field-completion не нужен — автокомплит значений отдельно

  projectionItem: [
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут сущности для проекции",
      required: true,
    },
  ],

  identificationItem: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор правила",
      required: true,
    },
    {
      name: "rule",
      type: "array",
      description: "Массив условий (attribute / and / or)",
    },
    {
      name: "filter",
      type: "array",
      description: "VRL-правило фильтрации (массив строк)",
    },
  ],

  identificationRuleItem: [
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут для идентификации",
    },
    {
      name: "and",
      type: "array",
      description: "Вложенные условия через логическое И",
    },
    {
      name: "or",
      type: "array",
      description: "Вложенные условия через логическое ИЛИ",
    },
  ],

  reconciliationItem: [
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут с приоритетами источников",
    },
    {
      name: "sourcePriority",
      type: "array",
      description: "Массив { source } в порядке убывания приоритета",
    },
    {
      name: "default",
      type: "array",
      description: "Источники по умолчанию для всех атрибутов",
    },
  ],

  reconciliationSourceItem: [
    {
      name: "source",
      type: "string",
      description: 'Название источника (или "*" для остальных)',
      required: true,
    },
  ],

  reconciliationDefaultItem: [
    {
      name: "source",
      type: "string",
      description: 'Название источника (или "*" для остальных)',
      required: true,
    },
  ],

  reconciliationMergeStrategy: [
    {
      name: "type",
      type: "enum",
      description:
        "replace | array_merge | array_concat | earliest_date | latest_date",
      required: true,
    },
  ],

  graphView: [
    {
      name: "iconColor",
      type: "enum",
      description: "Цвет иконки на графе (red / blue / green / …)",
    },
  ],
  permission: [
    {
      name: "id",
      type: "string",
      description: "Идентификатор разрешения",
      required: true,
    },
    { name: "name", type: "string", description: "Название разрешения" },
    { name: "description", type: "string", description: "Описание" },
  ],
  accessRule: [
    {
      name: "target",
      type: "enum",
      description:
        "entity | action | linkage | any_entity | any_action | any_linkage",
      required: true,
    },
    {
      name: "id",
      type: "string",
      description: "(target: action) Идентификатор действия",
    },
    { name: "entity", type: "ref", description: "(target: entity) Сущность" },
    { name: "linkage", type: "ref", description: "(target: linkage) Связь" },
    {
      name: "create",
      type: "array",
      description: "Правила доступа для создания",
    },
    {
      name: "delete",
      type: "array",
      description: "Правила доступа для удаления",
    },
    {
      name: "edit",
      type: "array",
      description: "Правила доступа для редактирования",
    },
    {
      name: "view",
      type: "array",
      description: "Правила доступа для просмотра",
    },
    {
      name: "launch",
      type: "array",
      description: "(target: action) Правила доступа для запуска",
    },
  ],
  localization: [
    {
      name: "language",
      type: "string",
      description: "Код языка (ru, en, ...)",
      required: true,
    },
    {
      name: "keys",
      type: "array",
      description: "Массив { key, to, ordinal? }",
      required: true,
    },
  ],
  accessRuleItem: [
    {
      name: "kind",
      type: "enum",
      description: "permission | pass | condition",
      required: true,
    },
    {
      name: "permission",
      type: "string",
      description: "(kind: permission) Название разрешения",
    },
    {
      name: "condition",
      type: "rql",
      description: "(kind: condition) RQL-условие",
    },
    {
      name: "except",
      type: "array",
      description: "Исключения { attribute, condition? }",
    },
  ],
  accessRuleException: [
    {
      name: "attribute",
      type: "ref",
      description: "Атрибут для исключения",
      required: true,
    },
    {
      name: "condition",
      type: "rql",
      description: "RQL-условие применения исключения",
    },
  ],
  actionOpenBoardsFromGraph: [
    {
      name: "openBoards",
      type: "boolean",
      description: "Открыть диаграмму в режиме доски",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "(при openBoards: true) Название кнопки",
    },
  ],
  treeNodeType: [
    {
      name: "type",
      type: "enum",
      description: "root | branch | leaf",
      required: true,
    },
    {
      name: "of",
      type: "array",
      description: "(type: branch/leaf) Список сущностей-контейнеров",
    },
  ],
  treeNodeOf: [
    {
      name: "treeNode",
      type: "ref",
      description: "Сущность-узел дерева вложения",
      required: true,
    },
  ],
  viewDashboardLayout: [
    { name: "type", type: "enum", description: "grid" },
    {
      name: "columns",
      type: "number",
      description: "Количество столбцов в сетке (при type: grid)",
    },
  ],
  viewWidgetDragDropContext: [
    {
      name: "dataType",
      type: "enum",
      description: "Array | Attachment | Table",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Имя атрибута сущности для прикрепления файла",
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
    contexts: ["attribute"],
    body: [
      "- id: ${1:attrId}",
      "  name: ${2:Новый атрибут}",
      "  description: ${3:Описание атрибута}",
      "  dataType: ${4:String}",
    ].join("\n"),
  },
  {
    prefix: "newref",
    description: "Атрибут-Reference",
    contexts: ["attribute"],
    body: [
      "- id: ${1:refAttr}",
      "  name: ${2:Ссылка на сущность}",
      "  dataType: Reference",
      "  entity: ${3:TargetEntity}",
    ].join("\n"),
  },
  {
    prefix: "newarr",
    description: "Атрибут-Array",
    contexts: ["attribute"],
    body: [
      "- id: ${1:arrayAttr}",
      "  name: ${2:Массив}",
      "  dataType: Array",
      "  item:",
      "    dataType: ${3:String}",
    ].join("\n"),
  },
  {
    prefix: "newidentifier",
    description: "Атрибут-Identifier (шаблон + префикс)",
    contexts: ["attribute"],
    body: [
      "- id: ${1:iocId}",
      "  name: ${2:Идентификатор}",
      "  dataType: Identifier",
      '  template: "{@prefix}-{@YYYY}-{@MM}-{@inc}"',
      "  defaultPrefix: ${3:INC}",
      '  incrementTemplate: "0000"',
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
  {
    prefix: "newview",
    description: "Entity-view с виджетами и блоком",
    contexts: ["viewList", "view"],
    body: [
      "- id: ${1:viewMyEntity}",
      "  type: entity",
      "  entity: ${2:MyEntity}",
      "  widgets:",
      "    - id: ${3:editors_id}",
      "      type: attribute",
      "      attribute: ${4:id}",
      "  groups:",
      "    - id: ${5:blocks_info}",
      "      type: block",
      "      layout:",
      "        direction: column",
      "      components:",
      "        - widget: ${6:editors_id}",
    ].join("\n"),
  },
  {
    prefix: "newlist",
    description: "List-view (список объектов)",
    contexts: ["viewList", "view"],
    body: [
      "- id: ${1:lists_MyEntity}",
      "  type: list",
      "  source:",
      "    type: operational",
      "    entity: ${2:MyEntity}",
      "  table:",
      "    columns:",
      "      - id: ${3:name}",
      "        attribute: ${4:id}",
      "        label: ${5:Название}",
    ].join("\n"),
  },
  {
    prefix: "newwidget",
    description: "Виджет атрибута",
    contexts: ["widget"],
    body: [
      "- id: ${1:editors_attr}",
      "  type: attribute",
      "  attribute: ${2:attrId}",
      "  description: ${3:Поле для редактирования}",
    ].join("\n"),
  },
  {
    prefix: "newgroup",
    description: "Группа типа block",
    contexts: ["group"],
    body: [
      "- id: ${1:blocks_info}",
      "  type: block",
      "  description: ${2:Блок информации}",
      "  layout:",
      "    direction: column",
      "  components:",
      "    - widget: ${3:editors_id}",
    ].join("\n"),
  },
  {
    prefix: "newsequence",
    description: "Последовательность",
    contexts: ["sequenceList", "sequence"],
    body: [
      "- id: ${1:MySequence}",
      "  startFrom: ${2:1}",
      "  description: ${3:Описание последовательности}",
    ].join("\n"),
  },
  {
    prefix: "newmixin",
    description: "Миксин на панель",
    contexts: ["mixinList", "mixin"],
    body: [
      "- id: ${1:mixin_new}",
      "  type: view",
      "  entity: ${2:TargetEntity}",
      "  views:",
      "    - id: ${3:mixin_view}",
      "      type: tab",
      "      to:",
      "        tab: ${4:tabs_info}",
      "      change:",
      "        add:",
      "          components:",
      "            - widget: ${5:editors_id}",
    ].join("\n"),
  },
  {
    prefix: "newmenu",
    description: "Пункт меню с подпунктом",
    contexts: ["menuList", "menu", "menuItem"],
    body: [
      "- id: ${1:menus_root}",
      '  label: "${2:Название раздела}"',
      "  route: ${3:/my-domain}",
      "  type: root_group",
      "  placement: top",
      "  items:",
      "    - id: ${4:menu_item}",
      "      label: ${5:Пункт меню}",
      "      route: ${6:/my-domain/item}",
      "      type: menu",
      "      view: ${7:lists_MyEntity}",
    ].join("\n"),
  },
  {
    prefix: "newmedia",
    description: "Иконка",
    contexts: ["mediaList", "media"],
    body: [
      "- id: ${1:iconsMyIcon}",
      "  description: ${2:Иконка для ...}",
      "  type: icon_name",
      "  iconName: ${3:folder}",
    ].join("\n"),
  },
  {
    prefix: "newenum",
    description: "Enum-тип данных",
    contexts: ["dataTypeList", "dataType"],
    body: [
      "- id: ${1:enumMyType}",
      "  name: ${2:Новый enum}",
      "  dataType: Enum",
      "  values:",
      "    - id: ${3:value1}",
      "      name: ${4:Значение 1}",
      "    - id: ${5:value2}",
      "      name: ${6:Значение 2}",
    ].join("\n"),
  },
  {
    prefix: "newworkflow",
    description: "Workflow-тип данных",
    contexts: ["dataTypeList", "dataType"],
    body: [
      "- id: ${1:workflowMyProcess}",
      "  name: ${2:Новый workflow}",
      "  dataType: Workflow",
      "  initial: ${3:New}",
      "  statuses:",
      "    - id: ${4:New}",
      "      name: ${5:Новый}",
      "    - id: ${6:Done}",
      "      name: ${7:Завершён}",
      "  transitions:",
      "    - from: ${8:New}",
      "      to: ${9:Done}",
    ].join("\n"),
  },
  {
    prefix: "newtable",
    description: "Table-тип данных",
    contexts: ["dataTypeList", "dataType"],
    body: [
      "- id: ${1:tableMyTable}",
      "  name: ${2:Новая таблица}",
      "  dataType: Table",
      "  maxRows: ${3:100}",
      "  attributes:",
      "    - id: ${4:col1}",
      "      name: ${5:Колонка 1}",
      "      dataType: String",
    ].join("\n"),
  },
  {
    prefix: "newenumvalue",
    description: "Значение Enum",
    contexts: ["enumValue"],
    body: ["- id: ${1:value1}", "  name: ${2:Значение 1}"].join("\n"),
  },
  {
    prefix: "newworkflowstatus",
    description: "Статус Workflow",
    contexts: ["workflowStatus"],
    body: [
      "- id: ${1:status1}",
      "  name: ${2:Статус 1}",
      "  description: ${3:Описание}",
    ].join("\n"),
  },
  {
    prefix: "newtransition",
    description: "Переход Workflow",
    contexts: ["transition"],
    body: ["- from: ${1:StatusA}", "  to: ${2:StatusB}"].join("\n"),
  },
  {
    prefix: "newconstraint",
    description: "Constraint (required / range / regexp...)",
    contexts: ["constraintsItem"],
    body: ["- kind: ${1:required}", "  message: ${2:Текст ошибки}"].join("\n"),
  },
  {
    prefix: "newconstraintlen",
    description: "Constraint: length с min/max",
    contexts: ["constraintsItem"],
    body: [
      "- kind: length",
      "  min: ${1:1}",
      "  max: ${2:255}",
      "  message: ${3:Недопустимая длина}",
    ].join("\n"),
  },
  {
    prefix: "newprefixrule",
    description: "Правило подстановки префикса",
    contexts: ["prefixRule"],
    body: [
      "- id: ${1:Rule_1}",
      "  attribute: ${2:attrId}",
      "  source:",
      "    entity: ${3:SomeDict}",
      "    key: ${4:fullName}",
      "    value: ${5:shortCode}",
    ].join("\n"),
  },
  {
    prefix: "newprojection",
    description: "Проекция сущности",
    contexts: ["entity"],
    body: [
      "projection:",
      "  - attribute: ${1:name}",
      "  - attribute: ${2:description}",
    ].join("\n"),
  },
  {
    prefix: "newsearching",
    description: "Правила поиска сущности",
    contexts: ["entity"],
    body: [
      "searching:",
      "  attributes:",
      "    - ${1:id}",
      "    - ${2:name}",
    ].join("\n"),
  },
  {
    prefix: "newcountercolor",
    description: "Цветовая схема счётчика",
    contexts: ["counterColorPattern"],
    body: [
      "- id: ${1:counterColorTime}",
      "  red: ${2:60%}",
      "  yellow: ${3:40%}",
    ].join("\n"),
  },
  {
    prefix: "newtree",
    description: "Дерево связей (1 уровень)",
    contexts: ["treeList", "tree"],
    body: [
      "- id: ${1:MyTree}",
      "  type: ordinary",
      "  maxDepth: ${2:5}",
      "  hierarchy:",
      "    entity: ${3:RootEntity}",
      "    maxInstances: ${4:1}",
      "    children:",
      "      - linkage: ${5:RootToChild}",
      "        entity: ${6:ChildEntity}",
      "        side: ${7:1}",
      "  sorting:",
      "    - id: ${8:sorting_name}",
      "      name: ${9:По наименованию}",
      "      by:",
      "        - entity: ${10:RootEntity}",
      "          by:",
      "            - attribute: ${11:name}",
      "              direction: asc",
    ].join("\n"),
  },
  {
    prefix: "newtransitive",
    description: "Транзитивная связь (1 хоп)",
    contexts: ["transitiveLinkageList", "transitiveLinkage"],
    body: [
      "- id: ${1:MyTransitiveTree}",
      "  entity: ${2:StartEntity}",
      "  description: ${3:Цепочка связей}",
      "  joins:",
      "    - id: ${4:join1}",
      "      linkage: ${5:StartToMiddle}",
      "      search:",
      "        enable: true",
      "        mode: both",
    ].join("\n"),
  },
  {
    prefix: "newjoins",
    description: "Следующий хоп в транзитивной связи",
    contexts: ["transitiveJoin"],
    body: [
      "- id: ${1:join_next}",
      "  linkage: ${2:NextLinkage}",
      "  search:",
      "    enable: ${3:true}",
      "    mode: ${4:both}",
    ].join("\n"),
  },
  {
    prefix: "newuirule",
    description: "UI Rule: скрыть виджет",
    contexts: ["uiRuleList", "uiRule"],
    body: [
      "- id: ${1:hiddenWidget}",
      "  name: ${2:Скрыть виджет}",
      "  target: entity_view",
      "  view: ${3:entityView}",
      "  condition: !rql ${4:true}",
      "  rule:",
      "    effect: hidden",
      "    widgets:",
      "      - widget: ${5:editors_id}",
    ].join("\n"),
  },
  {
    prefix: "newuirulevariant",
    description: "UI Rule: вариант с пресетами",
    contexts: ["uiRuleList", "uiRule"],
    body: [
      "- id: ${1:variantRule}",
      "  name: ${2:Цветовая вариация}",
      "  target: entity_view",
      "  view: ${3:entityView}",
      '  condition: !rql ${4:@doc.status = "CRITICAL"}',
      "  rule:",
      "    effect: variant",
      "    widgets:",
      "      - widget: ${5:editors_status}",
      "        presets:",
      "          - ${6:redPreset}",
    ].join("\n"),
  },
  {
    prefix: "newuirulenested",
    description: "UI Rule: скрыть колонку таблицы",
    contexts: ["uiRuleList", "uiRule"],
    body: [
      "- id: ${1:hiddenTableColumn}",
      "  name: ${2:Скрыть колонку в таблице}",
      "  target: entity_attribute",
      "  view: ${3:entityView}",
      "  condition: !rql ${4:true}",
      "  rule:",
      "    effect: hidden",
      "    widgets:",
      "      - widget: ${5:editors_table}",
      "        nested:",
      "          type: table",
      "          attributes:",
      "            - attribute: ${6:col1}",
    ].join("\n"),
  },
  {
    prefix: "newuipreset",
    description: "UI Preset (стили)",
    contexts: ["uiPresetList", "uiPreset"],
    body: [
      "- id: ${1:redPreset}",
      "  description: ${2:Красный фон}",
      "  props:",
      "    color: ${3:#ff0000}",
      "    font-weight: ${4:bold}",
    ].join("\n"),
  },
  {
    prefix: "newpresetref",
    description: "Ссылка на пресет в widgets/groups/columns",
    contexts: ["uiRuleWidget", "uiRuleGroup", "uiRuleColumn"],
    body: ["presets:", "  - ${1:redPreset}"].join("\n"),
  },
  {
    prefix: "newbulkdelete",
    description: "Массовое действие: удаление",
    contexts: ["actionList", "action"],
    body: [
      "- id: ${1:actions_bulkRemove}",
      "  name: ${2:Удалить}",
      "  type: bulk",
      "  entity: ${3:SomeEntity}",
      "  operation: remove",
    ].join("\n"),
  },
  {
    prefix: "newbulkedit",
    description: "Массовое действие: редактирование атрибутов",
    contexts: ["actionList", "action"],
    body: [
      "- id: ${1:actions_bulkEdit}",
      "  name: ${2:Изменить}",
      "  type: bulk",
      "  entity: ${3:SomeEntity}",
      "  operation: edit",
      "  attributes:",
      "    type: specific",
      "    use:",
      "      - attribute: ${4:attr1}",
      "      - attribute: ${5:attr2}",
    ].join("\n"),
  },
  {
    prefix: "newbulkattr",
    description: "Массовое действие: изменить атрибут (bool/workflow)",
    contexts: ["actionList", "action"],
    body: [
      "- id: ${1:actions_bulkSetBool}",
      "  name: ${2:Установить флаг}",
      "  type: bulk",
      "  entity: ${3:SomeEntity}",
      "  operation: edit_attribute",
      "  values:",
      "    - attribute: ${4:isActive}",
      "      value: ${5:true}",
      "  control:",
      "    type: ${6:bool_text}",
      '    trueText: "${7:Активен}"',
      '    falseText: "${8:Неактивен}"',
    ].join("\n"),
  },
  {
    prefix: "newautomationaction",
    description: "Действие запуска автоматизации",
    contexts: ["actionList", "action"],
    body: [
      "- id: ${1:actions_runAutomation}",
      "  name: ${2:Запустить автоматизацию}",
      "  type: automation",
      "  entity: ${3:SomeEntity}",
      "  automation:",
      "    id: ${4:3c521909-cc55-4b0c-b645-f79eb0263296}",
    ].join("\n"),
  },
  {
    prefix: "newscenarioaction",
    description: "Действие запуска сценария",
    contexts: ["actionList", "action"],
    body: [
      "- id: ${1:actions_runScenario}",
      "  name: ${2:Запустить сценарий}",
      "  type: scenario",
      "  entity: ${3:SomeEntity}",
      "  scenario: ${4:MyScenario}",
      "  workerTag: ${5:default}",
    ].join("\n"),
  },
  {
    prefix: "newlisttable",
    description: "Таблица с 3 колонками",
    contexts: ["viewList", "view"],
    body: [
      "table:",
      "  columns:",
      "    - id: ${1:id}",
      "      attribute: ${2:id}",
      "      label: ${3:Идентификатор}",
      "      layout:",
      "        width:",
      "          default: ${4:100}",
      "          min: 50",
      "          max: 200",
      "    - id: ${5:name}",
      "      attribute: ${6:name}",
      "      label: ${7:Название}",
      "    - id: ${8:createdAt}",
      "      attribute: createdAt",
      "      label: Дата создания",
      "      control:",
      "        type: timestamp",
    ].join("\n"),
  },
  {
    prefix: "newtablecolumn",
    description: "Колонка таблицы",
    contexts: ["viewTable"],
    body: [
      "- id: ${1:colId}",
      "  attribute: ${2:attrId}",
      "  label: ${3:Название колонки}",
      "  layout:",
      "    width:",
      "      default: ${4:150}",
      "      min: 50",
      "      max: 300",
    ].join("\n"),
  },
  {
    prefix: "newtablefilter",
    description: "Настройка фильтрации таблицы",
    contexts: ["viewTable"],
    body: [
      "filter:",
      "  attributes:",
      "    type: ${1:all}",
      "  linkages:",
      "    type: ${2:all}",
    ].join("\n"),
  },
  {
    prefix: "newtablesorting",
    description: "Сортировка по колонке",
    contexts: ["viewTable"],
    body: [
      "sortingBy:",
      "  columns:",
      "    - column: ${1:colId}",
      "      sorting: ${2:sortingId}",
      "  defaults:",
      "    column: ${3:colId}",
      "    direction: ${4:asc}",
    ].join("\n"),
  },
  {
    prefix: "newtablepaging",
    description: "Пагинация таблицы",
    contexts: ["viewTable"],
    body: [
      "paging:",
      "  sizes:",
      "    - 10",
      "    - 50",
      "    - 100",
      "  defaultSize: ${1:20}",
    ].join("\n"),
  },
  {
    prefix: "newtablerefresh",
    description: "Автообновление таблицы",
    contexts: ["viewTable"],
    body: [
      "refresh:",
      "  mode: ${1:auto}",
      "  defaults:",
      "    enabled: ${2:true}",
      "    unit: ${3:minute}",
      "    interval: ${4:5}",
    ].join("\n"),
  },
  {
    prefix: "newtablerowclick",
    description: "Действие при клике на строку",
    contexts: ["viewTable"],
    body: [
      "actions:",
      "  - type: row_click",
      "    action: ${1:actions_openPanel}",
    ].join("\n"),
  },
  {
    prefix: "newtablecontextmenu",
    description: "Контекстное меню строки",
    contexts: ["viewTable"],
    body: [
      "actions:",
      "  - type: row_context_menu",
      "    items:",
      "      - action: ${1:actions_edit}",
      "        label: ${2:Изменить}",
      "      - action: ${3:actions_remove}",
      "        label: ${4:Удалить}",
    ].join("\n"),
  },
  {
    prefix: "newtableaggregate",
    description: "Колонка с агрегацией (count)",
    contexts: ["viewTable"],
    body: [
      "- id: ${1:linkedCount}",
      "  label: ${2:Связанных}",
      "  join: ${3:my_join_id}",
      "  aggregate:",
      "    type: count",
      "    condition: !rql ${4:true}",
    ].join("\n"),
  },
  {
    prefix: "newlistfull",
    description: "Полный list-view с таблицей и фильтрами",
    contexts: ["viewList", "view"],
    body: [
      "- id: ${1:lists_MyEntity}",
      "  type: list",
      "  label: ${2:Список MyEntity}",
      "  source:",
      "    type: operational",
      "    entity: ${3:MyEntity}",
      "  table:",
      "    columns:",
      "      - id: ${4:id}",
      "        attribute: id",
      "        label: Идентификатор",
      "      - id: ${5:name}",
      "        attribute: name",
      "        label: Название",
      "    filter:",
      "      attributes:",
      "        type: all",
      "      linkages:",
      "        type: all",
      "    sortingBy:",
      "      defaults:",
      "        column: ${6:name}",
      "        direction: asc",
      "    paging:",
      "      sizes: [10, 50, 100]",
      "      defaultSize: 20",
      "    selection: true",
      "    actions:",
      "      - type: row_click",
      "        action: ${7:actions_openPanel}",
    ].join("\n"),
  },
  {
    prefix: "newentityview",
    description: "Entity-view с панелью и модалкой",
    contexts: ["viewList", "view"],
    body: [
      "- id: ${1:viewMyEntity}",
      "  type: entity",
      "  entity: ${2:MyEntity}",
      "  widgets:",
      "    - id: ${3:editors_id}",
      "      type: attribute",
      "      attribute: ${4:id}",
      "    - id: ${5:editors_name}",
      "      type: attribute",
      "      attribute: ${6:name}",
      "  groups:",
      "    - id: ${7:blocks_info}",
      "      type: block",
      "      layout:",
      "        direction: column",
      "      components:",
      "        - widget: ${8:editors_id}",
      "        - widget: ${9:editors_name}",
      "    - id: ${10:tabs_info}",
      "      type: tab",
      "      label: ${11:Детали}",
      "      components:",
      "        - block: ${12:blocks_info}",
      "    - id: ${13:blocks_forms_new}",
      "      type: form",
      "      layout:",
      "        direction: column",
      "      components:",
      "        - widget: ${14:editors_id}",
      "        - widget: ${15:editors_name}",
      "  views:",
      "    - id: ${16:panels_info}",
      "      type: panel",
      "      label: ${17:Детали}",
      "      tabs:",
      "        - tab: ${18:tabs_info}",
      "    - id: ${19:forms_new}",
      "      type: modal",
      "      form: ${20:blocks_forms_new}",
      "      label: ${21:Добавление}",
    ].join("\n"),
  },
  {
    prefix: "newwidgetattr",
    description: "Виджет атрибута с контролом",
    contexts: ["widget"],
    body: [
      "- id: ${1:editors_attr}",
      "  type: attribute",
      "  attribute: ${2:attrId}",
      "  description: ${3:Поле для редактирования}",
      "  control:",
      "    type: ${4:text}",
    ].join("\n"),
  },
  {
    prefix: "newwidgetlinkage",
    description: "Виджет связи с таблицей",
    contexts: ["widget"],
    body: [
      "- id: ${1:editors_linkage}",
      "  type: linkage",
      "  linkage: ${2:my_linkage_id}",
      "  label: ${3:Связанные объекты}",
      "  side: ${4:2}",
      "  control:",
      "    type: table",
      "    addLinksView: ${5:lists_MyEntity}",
      "    columns:",
      "      - id: ${6:name}",
      "        attribute: name",
    ].join("\n"),
  },
  {
    prefix: "newwidgetjoin",
    description: "Виджет транзитивной связи",
    contexts: ["widget"],
    body: [
      "- id: ${1:widget_join}",
      "  type: join",
      "  joinId: ${2:my_join_id}",
      "  attribute: ${3:Name}",
      "  label: ${4:Связанные}",
    ].join("\n"),
  },
  {
    prefix: "newblock",
    description: "Группа типа block",
    contexts: ["group"],
    body: [
      "- id: ${1:blocks_info}",
      "  type: block",
      "  label: ${2:Информация}",
      "  layout:",
      "    direction: column",
      "    expandable: false",
      "  components:",
      "    - widget: ${3:editors_id}",
    ].join("\n"),
  },
  {
    prefix: "newtab",
    description: "Вкладка",
    contexts: ["group"],
    body: [
      "- id: ${1:tabs_info}",
      "  type: tab",
      "  label: ${2:Детали}",
      "  components:",
      "    - block: ${3:blocks_info}",
    ].join("\n"),
  },
  {
    prefix: "newform",
    description: "Форма (modal form)",
    contexts: ["group"],
    body: [
      "- id: ${1:blocks_forms_new}",
      "  type: form",
      "  layout:",
      "    direction: column",
      "  components:",
      "    - widget: ${2:editors_id}",
      "    - widget: ${3:editors_name}",
    ].join("\n"),
  },
  {
    prefix: "newpanel",
    description: "Панель (компактное представление)",
    contexts: ["viewNested"],
    body: [
      "- id: ${1:panels_info}",
      "  type: panel",
      "  label: ${2:Детали}",
      "  menu:",
      "    - action: ${3:actions_edit}",
      "  tabs:",
      "    - tab: ${4:tabs_info}",
    ].join("\n"),
  },
  {
    prefix: "newmodal",
    description: "Модальное окно",
    contexts: ["viewNested"],
    body: [
      "- id: ${1:forms_new}",
      "  type: modal",
      "  form: ${2:blocks_forms_new}",
      "  label: ${3:Добавление}",
      "  buttons:",
      "    - type: submit",
      "      label: ${4:Создать}",
      "    - type: close",
      "      label: ${5:Отмена}",
    ].join("\n"),
  },
  {
    prefix: "newpage",
    description: "Полноэкранная карточка",
    contexts: ["viewNested"],
    body: [
      "- id: ${1:pages_info}",
      "  type: page",
      "  menuItem: ${2:menu_item_id}",
      "  actionPanel:",
      "    - widget: ${3:buttons_edit}",
      "  tabs:",
      "    - tab: ${4:tabs_info}",
      "  pinnedView:",
      "    block: ${5:blocks_header}",
      "    position: top",
      "    height: 30%",
    ].join("\n"),
  },
  {
    prefix: "newinherit",
    description: "Наследование группы / меню",
    contexts: ["inheritSettings"],
    body: ["inherit:", "  type: ${1:append}"].join("\n"),
  },
  {
    prefix: "newmenuroot",
    description: "Корневая группа меню с подпунктом",
    contexts: ["menuRootList", "menuRoot"],
    body: [
      "- id: ${1:menus_root}",
      "  route: ${2:/my-domain}",
      '  label: "${3:Название раздела}"',
      "  type: root_group",
      "  placement: top",
      "  priority: ${4:1000}",
      "  items:",
      "    - id: ${5:menu_item}",
      "      route: ${6:/my-domain/item}",
      "      label: ${7:Пункт меню}",
      "      type: menu",
      "      view: ${8:lists_MyEntity}",
      "      priority: ${9:1000}",
    ].join("\n"),
  },
  {
    prefix: "newmenuitem",
    description: "Пункт меню",
    contexts: ["menuItemList", "menuItem"],
    body: [
      "- id: ${1:menu_item}",
      "  route: ${2:/my-domain/item}",
      "  label: ${3:Пункт меню}",
      "  type: menu",
      "  view: ${4:lists_MyEntity}",
      "  priority: ${5:1000}",
    ].join("\n"),
  },
  {
    prefix: "newmedia",
    description: "Иконка",
    contexts: ["mediaList", "media"],
    body: [
      "- id: ${1:iconsMyIcon}",
      "  description: ${2:Иконка для ...}",
      "  type: icon_name",
      "  iconName: ${3:folder}",
    ].join("\n"),
  },
  {
    prefix: "newmixinview",
    description: "Миксин на вкладку (тип view)",
    contexts: ["mixinList", "mixin"],
    body: [
      "- id: ${1:mixin_tab}",
      "  name: ${2:Примесь вкладки}",
      "  type: view",
      "  entity: ${3:TargetEntity}",
      "  views:",
      "    - id: ${4:mixin_view}",
      "      type: tab",
      "      fromView: ${5:views_source}",
      "      to:",
      "        tab: ${6:tabs_info}",
      "      change:",
      "        add:",
      "          components:",
      "            - widget: ${7:editors_id}",
    ].join("\n"),
  },
  {
    prefix: "newmixinlinkage",
    description: "Миксин на основе связи (тип linkage)",
    contexts: ["mixinList", "mixin"],
    body: [
      "- id: ${1:mixin_linkage}",
      "  type: linkage",
      "  entity:",
      "    to: ${2:TargetEntity}",
      "    from: ${3:SourceEntity}",
      "  linkage: ${4:my_linkage_id}",
      "  views:",
      "    - id: ${5:mixin_panel}",
      "      type: panel",
      "      to:",
      "        panel: ${6:panels_info}",
      "      change:",
      "        add:",
      "          tabs:",
      "            tabs:",
      "              - tab: ${7:tabs_mixin}",
    ].join("\n"),
  },
  {
    prefix: "newexchange",
    description: "Настройки обмена данными",
    contexts: ["exchangeSettings"],
    body: [
      "exchangeSettings:",
      "  enable: ${1:true}",
      "  label: ${2:Обмен данными}",
      "  attributeFormats:",
      "    Date: DD-MM-YYYY",
      "    Time: HH:mm:ss",
      "    Timestamp: DD-MM-YYYYTHH:mm:ss",
      "  entities:",
      "    ${3:MyEntity}:",
      "      enable: true",
      "      forExport: ${4:id}",
    ].join("\n"),
  },
  {
    prefix: "newexchangeentity",
    description: "Настройки обмена для сущности",
    contexts: ["exchangeEntitySettings"],
    body: [
      "enable: ${1:true}",
      "label: ${2:MyEntity}",
      "forExport: ${3:id}",
      "upsertWith: ${4:name}",
    ].join("\n"),
  },
];

// ============ Определение контекста ============
/**
 * Определяет контекст для полей внутри элементов массивов
 * (`sorting[]`, `projection[]`, `identification[]`, `reconciliation[]`,
 *  а также вложенных `by[]`, `rule[]`, `sourcePriority[]`).
 *
 * Работает только для случая `key: ␣` (имя поля), не для значений.
 * Не мешает первому полю (`- ␣` / `- id: ␣` / `- attribute: ␣`) — там
 * возвращает `null`, и дальнейшая логика `detectContextAtPosition`
 * обрабатывает их как раньше.
 */
function detectArrayItemContext(model: any, position: any): string | null {
  const lineText = model.getLineContent(position.lineNumber);
  const beforeCursor = lineText.slice(0, position.column - 1);

  // Не лезем, если пользователь уже набирает значение
  if (/^\s*(?:-\s+)?[a-zA-Z_][\w]*\s*:\s+\S/.test(beforeCursor)) return null;
  if (/^\s*#/.test(beforeCursor)) return null;

  const currentIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;

  // Ищем ближайшую dash-строку `- xxx:` с меньшим indent
  let itemLine = -1;
  let itemIndent = -1;
  let itemKey = "";

  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const pl = model.getLineContent(i);
    if (!pl.trim() || pl.trim().startsWith("#")) continue;
    const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;
    if (pIndent >= currentIndent) continue;

    const dm = pl.match(/^(\s*)-\s+([a-zA-Z_][\w]*)\s*:/);
    if (dm) {
      itemLine = i;
      itemIndent = dm[1].length;
      itemKey = dm[2];
      break;
    }

    // Любой ключ на меньшем indent без `-` — мы не внутри `- xxx:` item
    const km = pl.match(/^\s*([a-zA-Z_][\w]*)\s*:/);
    if (km) return null;

    if (pIndent === 0) return null;
  }
  if (itemLine < 0) return null;

  // Ищем контейнер над `- xxx:` (с меньшим indent)
  for (let i = itemLine - 1; i >= 1; i--) {
    const pl = model.getLineContent(i);
    if (!pl.trim() || pl.trim().startsWith("#")) continue;
    const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;
    if (pIndent >= itemIndent) continue;

    const km = pl.match(/^\s*([a-zA-Z_][\w]*)\s*:/);
    if (!km) {
      if (pIndent === 0) break;
      continue;
    }
    const containerKey = km[1];

    if (itemKey === "id") {
      if (containerKey === "sorting") return "sortingItem";
      if (containerKey === "projection") return "projectionItem";
      if (containerKey === "identification") return "identificationItem";
      if (containerKey === "reconciliation") return "reconciliationItem";
    } else if (itemKey === "attribute") {
      if (containerKey === "by") return "sortingByItem";
      if (containerKey === "rule") return "identificationRuleItem";
      if (containerKey === "projection") return "projectionItem";
      if (containerKey === "sourcePriority") return "reconciliationSourceItem";
    } else if (itemKey === "source") {
      if (containerKey === "sourcePriority") return "reconciliationSourceItem";
      if (containerKey === "default") return "reconciliationSourceItem";
    }
    return null;
  }
  return null;
}

export function detectContextAtPosition(
  model: any,
  position: any,
  _lineContexts: Map<number, any>,
): string | null {
  // ===== Pre-check: 2+ поля внутри элементов массивов =====
  const arrayCtx = detectArrayItemContext(model, position);
  if (arrayCtx) return arrayCtx;

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

  if (parentKey === "menus") return hasDash ? "menuRoot" : "menuRootList";
  if (parentKey === "medias") return hasDash ? "media" : "mediaList";
  if (parentKey === "permissions") return "permission";
  if (parentKey === "accessRules") return "accessRule";
  if (parentKey === "localizations") return "localization";
  if (parentKey === "mixins") return hasDash ? "mixin" : "mixinList";
  if (parentKey === "exchangeSettings") return "exchangeSettings";

  if (parentKey === "entities") return hasDash ? "entity" : "entityList";
  if (parentKey === "linkages") return hasDash ? "linkage" : "linkageList";
  if (parentKey === "actions") return hasDash ? "action" : "actionList";
  if (parentKey === "dataRules") return hasDash ? "dataRule" : "dataRuleList";
  if (parentKey === "views") return hasDash ? "view" : "viewList";
  if (parentKey === "dataTypes") return hasDash ? "dataType" : "dataTypeList";
  if (parentKey === "sequences") return hasDash ? "sequence" : "sequenceList";
  if (
    parentKey === "counterColorPattern" ||
    parentKey === "counterColorPatterns"
  )
    return "counterColorPattern";
  if (parentKey === "trees") return hasDash ? "tree" : "treeList";
  if (parentKey === "transitiveLinkages")
    return hasDash ? "transitiveLinkage" : "transitiveLinkageList";
  if (parentKey === "uiRules") return hasDash ? "uiRule" : "uiRuleList";
  if (parentKey === "uiPresets") return hasDash ? "uiPreset" : "uiPresetList";

  // ============ NEW: treeNode.types / of ============
  if (parentKey === "types" && section === "entities") {
    return hasDash ? "treeNodeType" : "treeNodeTypeList";
  }
  if (parentKey === "of" && section === "entities") {
    return hasDash ? "treeNodeOf" : "treeNodeOfList";
  }

  // ============ NEW: accessRules scopes ============
  if (section === "accessRules") {
    if (
      parentKey === "create" ||
      parentKey === "delete" ||
      parentKey === "edit" ||
      parentKey === "view" ||
      parentKey === "launch"
    ) {
      return hasDash ? "accessRuleItem" : "accessRuleItemList";
    }
    if (parentKey === "except") {
      return hasDash ? "accessRuleException" : "accessRuleExceptionList";
    }
  }

  // ============ NEW: action.openBoardsFromGraph ============
  if (parentKey === "openBoardsFromGraph") {
    return "actionOpenBoardsFromGraph";
  }

  // ============ NEW: drag_drop_area.context ============
  if (parentKey === "context" && section === "views") {
    return "viewWidgetDragDropContext";
  }

  // ============ menus ============
  if (section === "menus") {
    if (parentKey === "items") {
      return hasDash ? "menuItem" : "menuItemList";
    }
  }

  // ============ mixins ============
  if (section === "mixins") {
    if (parentKey === "entity") {
      // Примесь direction
      const beforeEntity = model.getLineContent(parentLine).slice(0, 20);
      return "mixinEntity";
    }
    if (parentKey === "views") {
      return hasDash ? "mixinView" : "mixinViewList";
    }
    if (parentKey === "to") {
      // to: может быть внутри mixinView — уточняем родителя
      return "mixinViewTo";
    }
    if (parentKey === "change") return "mixinChange";
    if (parentKey === "add") return "mixinChangeAdd";
    if (parentKey === "position") return "mixinPosition";
    if (parentKey === "components") {
      // Компоненты внутри mixin change.add
      return "viewGroupComponent";
    }
  }

  // ============ exchangeSettings ============
  if (section === "exchangeSettings") {
    if (parentKey === "attributeFormats") return "exchangeAttributeFormats";
    if (parentKey === "entities") {
      // entities — это объект, ключи которого сущности
      // Но detectContextAtPosition работает по parentKey. Здесь entities содержит ключи-сущности.
      // Возвращаем exchangeEntitySettings если находимся внутри одной из сущностей
      return "exchangeEntitySettings";
    }
  }

  // ============ actions: расширение ============
  if (section === "actions") {
    if (parentKey === "bulk") return "actionBulk";
    if (parentKey === "automation") return "actionAutomation";
    if (parentKey === "values") return "actionValue";
    if (parentKey === "control") return "actionControl";
    if (parentKey === "attributes") {
      // Различаем атрибуты сущности и bulk-атрибуты действия
      return "actionBulkAttributes";
    }
    if (parentKey === "linkages") return "actionBulkLinkages";
    if (parentKey === "use") {
      // use может быть в attributes или linkages bulk-действия
      let useContext: string | null = null;
      for (let j = parentLine - 1; j >= 1; j--) {
        const l = model.getLineContent(j);
        const lIndent = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (lIndent < parentIndent) {
          const keyM = l.match(/^\s*(attributes|linkages)\s*:/);
          if (keyM) useContext = keyM[1];
          break;
        }
      }
      if (useContext === "attributes") return "actionBulkAttributeUse";
      if (useContext === "linkages") return "actionBulkLinkageUse";
    }
  }

  if (parentKey === "attributes") {
    // Ищем предка "searching:" выше attributes
    let sawSearching = false;
    for (let i = parentLine - 1; i >= 1; i--) {
      const l = model.getLineContent(i);
      if (!l.trim() || l.trim().startsWith("#")) continue;
      const lIndent = (l.match(/^(\s*)/) || ["", ""])[1].length;
      if (lIndent >= parentIndent) continue;
      if (/^\s*searching\s*:\s*$/.test(l)) {
        sawSearching = true;
        break;
      }
      break;
    }
    if (sawSearching) return "searchingAttributesItem";
    return section === "linkages" ? "linkageAttribute" : "attribute";
  }

  // ============ 3.5. Лист внутри массива объектов ============
  // Если parentKey — листовое поле (attribute/source/value/...),
  // а курсор находится на уровне sibling'а (следующего поля того же объекта),
  // нужно вернуть контекст массива, а не листа.
  {
    const LEAF_TO_CONTAINERS: Record<string, string[]> = {
      attribute: ["by", "rule", "projection", "sourcePriority"],
      source: ["sourcePriority", "default"],
    };
    const containers = LEAF_TO_CONTAINERS[parentKey];
    if (containers && containers.length > 0) {
      for (let i = parentLine - 1; i >= 1; i--) {
        const pl = model.getLineContent(i);
        if (!pl.trim() || pl.trim().startsWith("#")) continue;
        const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;
        if (pIndent >= parentIndent) continue;
        const km = pl.match(/^\s*(?:-\s+)?([a-zA-Z_][\w]*)\s*:/);
        if (!km) {
          if (pIndent === 0) break;
          continue;
        }
        const key = km[1];
        if (containers.includes(key)) {
          if (key === "by") return "sortingByItem";
          if (key === "rule") return "identificationRuleItem";
          if (key === "projection") return "projectionItem";
          if (key === "sourcePriority" || key === "default")
            return "reconciliationSourceItem";
        }
        if (pIndent === 0) break;
      }
    }
  }

  // ============ 4. Вложенные контейнеры ============
  if (parentKey === "constraints") return "attributeConstraint";
  if (parentKey === "item") return "arrayItem";
  if (parentKey === "calculation") return "calculation";
  if (parentKey === "prefixRules") return "prefixRule";
  if (parentKey === "rule" && section === "entities")
    return "identificationRuleItem";

  // source внутри prefixRules[].source — отличаем от других source
  if (parentKey === "source") {
    // Проверим, что выше есть prefixRules
    for (let i = parentLine - 1; i >= 1; i--) {
      const l = model.getLineContent(i);
      const lIndent = (l.match(/^(\s*)/) || ["", ""])[1].length;
      if (lIndent < parentIndent) {
        if (/^\s*prefixRules\s*:/.test(l)) return "prefixRuleSource";
        break;
      }
      if (lIndent === 0) break;
    }
    return null;
  }
  if (parentKey === "sorting") return "sortingItem";
  if (parentKey === "by") return "sortingByItem";
  if (parentKey === "searching") return "searchingObject";
  if (parentKey === "identification") return "identificationItem";
  if (parentKey === "reconciliation") return "reconciliationItem";
  if (parentKey === "projection") return "projectionItem";
  if (parentKey === "nameFrom") return "nameFrom";
  if (parentKey === "control") return "widgetControl";
  if (parentKey === "sourcePriority") return "reconciliationSourceItem";

  if (parentKey === "default" && section === "entities")
    return "reconciliationDefaultItem";

  if (parentKey === "mergeStrategy") return "reconciliationMergeStrategy";

  if (parentKey === "graphView") return "graphView";
  // ============ views: list-view ============
  if (section === "views") {
    // widgets[]
    if (parentKey === "widgets") {
      // Внутри виджета мы уже в контексте widget, это поле control/linkage...
      return "widget";
    }
    if (parentKey === "control") {
      // Контекст зависит от родителя: linkage.control или widgets[].control
      let controlParent: "linkage" | "widget" | "attribute" | null = null;
      for (let j = parentLine - 1; j >= 1; j--) {
        const l = model.getLineContent(j);
        const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (lInd < parentIndent) {
          const km = l.match(/^\s*(linkage|widget|attribute)\s*:/);
          if (km) controlParent = km[1] as any;
          break;
        }
      }
      if (controlParent === "linkage") return "viewWidgetLinkageControl";
      if (controlParent === "attribute")
        return "viewWidgetLinkageAttributeControl";
      return "viewWidgetControl";
    }
    if (parentKey === "linkage") {
      // linkage: <ref> — это может быть внутри widget или отдельный linkage. Уточняем:
      // Если внутри views.widgets[] — это виджет, а не атрибут ссылки
      let insideWidget = false;
      for (let j = parentLine - 1; j >= 1; j--) {
        const l = model.getLineContent(j);
        const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (lInd < parentIndent) {
          if (/^\s*widgets\s*:/.test(l)) insideWidget = true;
          break;
        }
      }
      // если это внутри widgets[] — это свойство widget, не отдельный контекст
      // (parentKey = "id" выше — уже покрывает)
      if (!insideWidget) return "linkage";
    }
    if (parentKey === "columns") {
      // Внутри widget.linkage.control.columns
      let insideLinkage = false;
      for (let j = parentLine - 1; j >= 1; j--) {
        const l = model.getLineContent(j);
        const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (lInd < parentIndent) {
          if (/^\s*linkage\s*:/.test(l)) insideLinkage = true;
          break;
        }
      }
      if (insideLinkage) return "viewWidgetLinkageColumn";
      return "viewTableColumn";
    }
    if (parentKey === "attributes") {
      // Внутри widget.linkage.attributes
      let insideLinkageWidget = false;
      for (let j = parentLine - 1; j >= 1; j--) {
        const l = model.getLineContent(j);
        const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (lInd < parentIndent) {
          if (/^\s*linkage\s*:/.test(l)) insideLinkageWidget = true;
          break;
        }
      }
      if (insideLinkageWidget) return "viewWidgetLinkageAttributes";
      return "attribute"; // обычные атрибуты сущности
    }

    // groups
    if (parentKey === "groups") {
      return "group";
    }
    if (parentKey === "layout") return "viewGroupLayout";
    if (parentKey === "components") return "viewGroupComponent";
    if (parentKey === "inherit" || parentKey === "inherits")
      return "inheritSettings";

    // views[] внутри views (nested cards)
    if (parentKey === "views") return "viewNested";
    if (parentKey === "menu" || parentKey === "actionPanel") {
      // menu в panel, actionPanel в page — оба массивы action
      return parentKey === "actionPanel"
        ? "viewActionPanelItem"
        : "viewMenuAction";
    }
    if (parentKey === "tabs") return "viewTab";
    if (parentKey === "buttons") return "viewButton";
    if (parentKey === "footer") return "viewFooterAction";
    if (parentKey === "pinnedView") return "viewPinnedView";
    if (parentKey === "onView") {
      // onView — массив action, но только set_attribute_value
      return "viewButtonAction";
    }
    if (parentKey === "conversationTransports") {
      // conversation widget
      return "viewWidgetConversation";
    }
    if (parentKey === "source") return "viewSource";
    if (parentKey === "joins") return "viewSourceJoin";
    if (parentKey === "table") return "viewTable";
    if (parentKey === "columns") {
      // Различаем viewTable.columns и views.widgets.linkage.control.columns
      // по ближайшему контейнеру выше
      let colParent: "table" | "widget" | null = null;
      for (let j = parentLine - 1; j >= 1; j--) {
        const l = model.getLineContent(j);
        const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (lInd < parentIndent) {
          const km = l.match(/^\s*(table|control|widgets|linkage|join)\s*:/);
          if (km) {
            if (km[1] === "table") colParent = "table";
            else colParent = "widget";
          }
          break;
        }
      }
      // Если находимся в views.widgets[].control.columns — это колонки виджета связи
      // Но для простоты возвращаем viewTableColumn — подойдёт для обоих
      return "viewTableColumn";
    }
    if (parentKey === "layout") return "viewTableColumnLayout";
    if (parentKey === "width") return "viewTableColumnWidth";
    if (parentKey === "aggregate") return "viewTableColumnAggregate";
    if (parentKey === "filter") return "viewTableFilter";
    if (parentKey === "use") {
      // use может быть в attributes или linkages filter
      let useParent: "attributes" | "linkages" | null = null;
      for (let j = parentLine - 1; j >= 1; j--) {
        const l = model.getLineContent(j);
        const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (lInd < parentIndent) {
          const km = l.match(/^\s*(attributes|linkages)\s*:/);
          if (km) useParent = km[1] as any;
          break;
        }
      }
      if (useParent === "attributes") return "viewTableFilterAttributesUse";
      if (useParent === "linkages") return "viewTableFilterLinkagesUse";
    }
    if (parentKey === "sortingBy") return "viewTableSortingBy";
    if (parentKey === "defaults") {
      // defaults может быть в sortingBy или refresh
      let defParent: "sortingBy" | "refresh" | null = null;
      for (let j = parentLine - 1; j >= 1; j--) {
        const l = model.getLineContent(j);
        const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (lInd < parentIndent) {
          const km = l.match(/^\s*(sortingBy|refresh)\s*:/);
          if (km) defParent = km[1] as any;
          break;
        }
      }
      return defParent === "refresh"
        ? "viewTableRefreshDefaults"
        : "viewTableSortingByDefault";
    }
    if (parentKey === "paging") return "viewTablePaging";
    if (parentKey === "refresh") return "viewTableRefresh";
    if (parentKey === "actions") return "viewTableAction";
    if (parentKey === "items") return "viewTableActionItem";
    if (parentKey === "empty") return "viewTableEmpty";
    if (parentKey === "actionPanel") return "viewActionPanelItem";
    if (parentKey === "control") return "viewTableColumnControl";
  }

  // Старый fallback для table (если views-контекст не распознан)
  if (parentKey === "table") return "viewTable";
  if (parentKey === "values") return "enumValue";
  if (parentKey === "statuses") return "workflowStatus";
  if (parentKey === "transitions") return "transition";
  if (parentKey === "items" && section === "menus") return "menuItem";
  if (parentKey === "widgets") return "widget";
  if (parentKey === "groups") return "group";
  if (parentKey === "rule") {
    if (section === "dataRules") return "dataRuleRule";
    if (section === "uiRules") return "uiRuleRule";
    return "identificationRule";
  }
  // ============ trees ============
  if (parentKey === "hierarchy") return "treeHierarchy";
  if (parentKey === "children") return "treeChildren";
  if (parentKey === "sorting" && section === "trees") {
    // Различаем treeSorting и treeSortingBy:
    // если выше есть `by:` — значит это уже внутри by[].by[]
    return hasDash ? "treeSorting" : "treeSortingList";
  }
  if (parentKey === "by" && section === "trees") {
    // Определяем уровень: внешний (entity + by) или внутренний (attribute + direction)
    // Смотрим, что было перед нашим `by:` — `- id:` или `- entity:`
    let byParentKind: "id" | "entity" | null = null;
    for (let i = parentLine - 1; i >= 1; i--) {
      const l = model.getLineContent(i);
      const lIndent = (l.match(/^(\s*)/) || ["", ""])[1].length;
      if (lIndent >= parentIndent) continue;
      if (/^\s*-\s+id\s*:/.test(l)) {
        byParentKind = "id";
        break;
      }
      if (/^\s*-\s+entity\s*:/.test(l)) {
        byParentKind = "entity";
        break;
      }
      if (lIndent === 0) break;
    }
    if (byParentKind === "entity") return "treeSortingByBy";
    return "treeSortingBy";
  }

  // ============ transitiveLinkages ============
  if (parentKey === "joins" && section === "transitiveLinkages")
    return "transitiveJoin";
  if (parentKey === "search" && section === "transitiveLinkages")
    return "transitiveJoinSearch";

  // ============ uiRules ============
  if (parentKey === "rule" && section === "uiRules") return "uiRuleRule";
  if (parentKey === "context" && section === "uiRules") return "uiRuleContext";
  if (parentKey === "widgets" && section === "uiRules") return "uiRuleWidget";
  if (parentKey === "groups" && section === "uiRules") return "uiRuleGroup";
  if (parentKey === "columns" && section === "uiRules") return "uiRuleColumn";
  if (parentKey === "nested" && section === "uiRules") return "uiRuleNested";
  if (parentKey === "attributes" && section === "uiRules")
    return "uiRuleNestedAttribute";
  if (parentKey === "items" && section === "uiRules") return "uiRuleNestedItem";
  if (parentKey === "props" && section === "uiPresets") return "uiPresetProps";

  // ============ 5. Внутри `- id: ...` — определяем по section и наличию attributes выше ============
  if (parentKey === "id") {
    // 5a. Для views: определяем, в каком массиве находимся
    //     (widgets / groups / views / actionPanel)
    if (section === "views") {
      for (let i = parentLine - 1; i >= 1; i--) {
        const l = model.getLineContent(i);
        if (!l.trim() || l.trim().startsWith("#")) continue;
        const lIndent = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (lIndent >= parentIndent) continue;

        const arrM = l.match(/^\s*(widgets|groups|views|actionPanel)\s*:\s*$/);
        if (arrM) {
          const arr = arrM[1];
          if (arr === "widgets") return "widget";
          if (arr === "groups") return "group";
          if (arr === "views") return "viewNested";
          if (arr === "actionPanel") return "widget"; // панель действий — массив action-виджетов
        }

        // предыдущий item верхнего уровня — граница
        if (/^\s*-\s+id\s*:/.test(l) && lIndent < parentIndent) break;
        if (lIndent === 0) break;
      }
    }

    // 5b. Ищем `attributes:` выше (entities, linkages)
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

    // 5c. Fallback по section
    if (section === "entities") return "entity";
    if (section === "linkages") return "linkage";
    if (section === "actions") return "action";
    if (section === "dataRules") return "dataRule";
    if (section === "views") return "view";
    if (section === "mixins") return "mixin";
    if (section === "sequences") return "sequence";
    if (section === "dataTypes") return "dataType";
    if (section === "accessRules") return "accessRule";
    if (section === "permissions") return "permission";
    if (section === "localizations") return "localization";
  }

  if (parentKey === "exchangeSettings") return "exchangeSettings";
  if (parentKey === "attributeFormats") return "exchangeAttributeFormats";
  // entities в exchangeSettings — это объект { <EntityId>: { ... } },
  // поэтому для полей внутри конкретной сущности возвращаем exchangeEntity.
  // parentKey будет равен имени entity (не "entities"), т.к. стек
  // отслеживает ключи. Различим по ancestor "exchangeSettings".
  if (section === "exchangeSettings") {
    // Найти ближайший ancestor с ключом "entities" — тогда это поле внутри сущности
    for (let i = position.lineNumber - 1; i >= 1; i--) {
      const pl = model.getLineContent(i);
      const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;
      if (pIndent >= currentIndent) continue;
      const m = pl.match(/^\s*([a-zA-Z_][\w]*)\s*:/);
      if (!m) continue;
      if (m[1] === "entities") return "exchangeEntity";
      if (pIndent === 0) break;
    }
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

// ============ Кеш коллекций: пересобираем только при смене ModelIndex/домена ============

interface CollectionsCache {
  indexRef: any;
  domainRef: string | null;
  entities?: SectionRef[];
  linkages?: SectionRef[];
  actions?: SectionRef[];
  sequences?: SectionRef[];
  counterColorPattern?: SectionRef[];
  menus?: SectionRef[];
  uiPresets?: SectionRef[];
  trees?: SectionRef[];
  views?: SectionRef[];
  widgets?: SectionRef[];
  groups?: SectionRef[];
  columns?: SectionRef[];
  attributes?: RefSuggestion[];
  scenarios?: RefSuggestion[];
}

const _colCache: CollectionsCache = { indexRef: null, domainRef: null };

function ensureCache(): CollectionsCache {
  if (
    _colCache.indexRef !== ctx.modelIndex ||
    _colCache.domainRef !== ctx.currentDomainId
  ) {
    _colCache.indexRef = ctx.modelIndex;
    _colCache.domainRef = ctx.currentDomainId;
    _colCache.entities = undefined;
    _colCache.linkages = undefined;
    _colCache.actions = undefined;
    _colCache.sequences = undefined;
    _colCache.counterColorPattern = undefined;
    _colCache.menus = undefined;
    _colCache.uiPresets = undefined;
    _colCache.trees = undefined;
    _colCache.views = undefined;
    _colCache.widgets = undefined;
    _colCache.groups = undefined;
    _colCache.columns = undefined;
    _colCache.attributes = undefined;
    _colCache.scenarios = undefined;
  }
  return _colCache;
}

// Быстрый доступ — каждый lazily
function cachedEntities(): SectionRef[] {
  const c = ensureCache();
  return (c.entities ??= collectSectionRefs(ctx, "entities"));
}
function cachedLinkages(): SectionRef[] {
  const c = ensureCache();
  return (c.linkages ??= collectSectionRefs(ctx, "linkages"));
}
function cachedActions(): SectionRef[] {
  const c = ensureCache();
  return (c.actions ??= collectSectionRefs(ctx, "actions"));
}
function cachedSequences(): SectionRef[] {
  const c = ensureCache();
  return (c.sequences ??= collectSectionRefs(ctx, "sequences"));
}
function cachedCounterColors(): SectionRef[] {
  const c = ensureCache();
  return (c.counterColorPattern ??= collectSectionRefs(
    ctx,
    "counterColorPattern",
  ));
}
function cachedMenus(): SectionRef[] {
  const c = ensureCache();
  return (c.menus ??= collectSectionRefs(ctx, "menus"));
}
function cachedUiPresets(): SectionRef[] {
  const c = ensureCache();
  return (c.uiPresets ??= collectSectionRefs(ctx, "uiPresets"));
}
function cachedTrees(): SectionRef[] {
  const c = ensureCache();
  return (c.trees ??= collectSectionRefs(ctx, "trees"));
}
function cachedViews(): SectionRef[] {
  const c = ensureCache();
  return (c.views ??= collectViewRefs(ctx));
}
function cachedWidgets(): SectionRef[] {
  const c = ensureCache();
  return (c.widgets ??= collectWidgetRefs(ctx));
}
function cachedGroups(): SectionRef[] {
  const c = ensureCache();
  return (c.groups ??= collectGroupRefs(ctx));
}
function cachedColumns(): SectionRef[] {
  const c = ensureCache();
  return (c.columns ??= collectColumnRefs(ctx));
}
function findCurrentDataTypeId(model: any, position: any): string | null {
  // Ищем ближайший "- id: X" выше курсора, потом убеждаемся, что в его
  // блоке встретился dataType: Workflow/Enum/Table (то есть это элемент dataTypes[])
  const currentLine = position.lineNumber;
  const lineText = model.getLineContent(currentLine);
  const currentIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;

  let dataTypesSectionLine = -1;
  for (let i = currentLine - 1; i >= 1; i--) {
    const l = model.getLineContent(i);
    const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind === 0 && /^([a-zA-Z_][\w]*)\s*:/.test(l)) {
      const key = l.match(/^([a-zA-Z_][\w]*)\s*:/)![1];
      if (key === "dataTypes") dataTypesSectionLine = i;
      break;
    }
  }
  if (dataTypesSectionLine === -1) return null;

  let itemId: string | null = null;
  let itemIndent = -1;
  for (let i = dataTypesSectionLine + 1; i <= currentLine; i++) {
    const l = model.getLineContent(i);
    if (!l.trim() || l.trim().startsWith("#")) continue;
    const m = l.match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
    if (!m) continue;
    itemId = m[2].replace(/["']/g, "");
    itemIndent = m[1].length;
  }
  if (!itemId) return null;

  // Убедимся, что внутри этого item встретился dataType: Workflow
  for (let i = dataTypesSectionLine + 1; i <= currentLine; i++) {
    const l = model.getLineContent(i);
    if (!l.trim()) continue;
    const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind <= itemIndent && /^\s*-\s+id\s*:/.test(l) && i !== 1) {
      // Проверяем: этот `- id:` — новый item? Если да — мы уже прошли границу
      const cmp = i === dataTypesSectionLine + 1 ? true : true;
      // Просто идём до currentLine — грубо, но работает
    }
    if (/^\s*dataType\s*:\s*Workflow\b/.test(l)) return itemId;
  }
  return null;
}

function getDataTypeStatuses(model: any, position: any): string[] {
  const dtId = findCurrentDataTypeId(model, position);
  if (!dtId || !ctx.modelIndex) return [];
  const cur = (ctx.currentDomainId || "").toLowerCase();
  const dt = ctx.modelIndex.dataTypes.find(
    (d: any) => (d.domainId || "").toLowerCase() === cur && d.id === dtId,
  );
  if (!dt || dt.kind !== "Workflow") return [];
  return Array.isArray(dt.statuses) ? dt.statuses : [];
}

function cachedAttributes(): RefSuggestion[] {
  const c = ensureCache();
  if (c.attributes) return c.attributes;
  const cur = (ctx.currentDomainId || "").toLowerCase();
  const seen = new Set<string>();
  const out: RefSuggestion[] = [];

  // ============ Системные атрибуты — всегда доступны ============
  SYSTEM_ATTRIBUTES_FOR_COMPLETION.forEach((sys) => {
    seen.add(sys.id);
    out.push({
      label: sys.id,
      insertText: " " + sys.id,
      kind: 0,
      sortText: "0_" + sys.id,
      detail: sys.dataType,
      documentation: sys.description + " · системный",
    });
  });

  const mkDoc = (a: any, contextLabel: string) => {
    const parts: string[] = [];
    if (a.dataType) parts.push(a.dataType);
    if (a.description) parts.push(a.description);
    if (a.constraints?.length)
      parts.push(`constraints: ${a.constraints.join(", ")}`);
    parts.push(contextLabel);
    return parts.join(" · ");
  };

  ctx.modelIndex?.entities?.forEach((e: any) => {
    if ((e.domainId || "").toLowerCase() !== cur) return;
    e.attributes?.forEach((a: any) => {
      if (a?.id && !seen.has(a.id)) {
        seen.add(a.id);
        out.push({
          label: a.id,
          insertText: " " + a.id,
          kind: 0,
          sortText: "0_" + a.id,
          detail: `entity: ${e.entityId}`,
          documentation: mkDoc(a, `entity: ${e.entityId}`),
        });
      }
      a?.nestedAttributes?.forEach((na: any) => {
        if (na?.id && !seen.has(na.id)) {
          seen.add(na.id);
          out.push({
            label: na.id,
            insertText: " " + na.id,
            kind: 0,
            sortText: "1_" + na.id,
            detail: `table: ${e.entityId}.${a.id}`,
            documentation: mkDoc(na, `table: ${e.entityId}.${a.id}`),
          });
        }
      });
    });
  });
  c.attributes = out;
  return out;
}
function cachedScenarios(): RefSuggestion[] {
  const c = ensureCache();
  if (c.scenarios) return c.scenarios;

  const seen = new Set<string>();
  const out: RefSuggestion[] = [];

  (ctx.modelIndex?.scenarios || []).forEach((s: any) => {
    if (!s?.id || seen.has(s.id)) return;
    seen.add(s.id);

    const actions: Array<{
      domainId?: string;
      actionId?: string;
      actionName?: string;
      workerTag?: string;
    }> = Array.isArray(s.actions) ? s.actions : [];
    const domains: string[] = Array.isArray(s.domains) ? s.domains : [];

    const details: string[] = [];
    details.push(
      `${actions.length} ${actions.length === 1 ? "экшен" : "экшенов"}`,
    );
    if (domains.length > 0) details.push(`домены: ${domains.join(", ")}`);

    if (actions.length > 0) {
      details.push("---");
      for (const a of actions.slice(0, 20)) {
        const where = a.domainId ? `[${a.domainId}] ` : "";
        const tag = a.workerTag ? ` · worker: ${a.workerTag}` : "";
        const name = a.actionName || a.actionId || "";
        const id =
          a.actionId && a.actionName && a.actionId !== a.actionName
            ? ` (${a.actionId})`
            : "";
        details.push(`${where}${name}${id}${tag}`);
      }
      if (actions.length > 20) {
        details.push(`… и ещё ${actions.length - 20}`);
      }
    }

    out.push({
      label: s.id,
      insertText: " " + s.id,
      kind: 0, // Kind будет переустановлен через withKind
      sortText: "0_" + s.id,
      detail: `${actions.length} actions${domains.length ? " · " + domains.join(", ") : ""}`,
      documentation: details.join("\n"),
    });
  });

  c.scenarios = out;
  return out;
}

// Кеш `Kind` — перезаписывается при первом обращении, если needed
function withKind(items: RefSuggestion[], kind: number): RefSuggestion[] {
  return items.map((x) => ({ ...x, kind }));
}

// ============ RQL: определение контекста и предложения ============

const RQL_FIELDS = new Set(["expression", "constraint", "condition"]);

/** Курсор внутри RQL? */
function isInsideRql(model: any, position: any): boolean {
  const lineText = model.getLineContent(position.lineNumber);
  const beforeCursor = lineText.slice(0, position.column - 1);

  // Случай 1: на текущей строке — `field: !rql ...`
  const fm = beforeCursor.match(/^(\s*)(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*(.*)$/);
  if (fm) {
    const fieldName = fm[2];
    const rawValue = fm[3];

    // Явный YAML-тег !rql
    if (/!rql\b/.test(rawValue)) return true;

    // Поля, где по спецификации RQL всегда (если не литерал)
    if (RQL_FIELDS.has(fieldName)) {
      const trimmedNoComment = rawValue.split("#")[0].trim();
      // `condition: true` / `false` — литерал, не RQL
      if (/^(true|false)$/i.test(trimmedNoComment)) return false;
      // Пустое или частично набранное значение — тоже RQL-контекст
      return true;
    }
  }

  // Случай 2: block scalar `field: !rql |` или `field: |`, где field ∈ RQL_FIELDS
  const currentIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;
  for (let i = position.lineNumber - 1; i >= 1; i--) {
    const pl = model.getLineContent(i);
    if (!pl.trim()) continue;
    const pIndent = (pl.match(/^(\s*)/) || ["", ""])[1].length;

    if (pIndent < currentIndent) {
      const bm = pl.match(
        /^(\s*)(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*(!rql\s+)?[|>]/,
      );
      if (bm) {
        const fieldName = bm[2];
        if (bm[3] || RQL_FIELDS.has(fieldName)) return true;
      }
      return false;
    }

    if (pIndent === 0) return false;
  }
  return false;
}

// ============ RQL: @root.member ============

/** Сканирует токен назад от курсора, включая `@` и `.`. */
function scanRqlToken(
  model: any,
  position: any,
): { startColumn: number; tokenText: string } {
  const lineText = model.getLineContent(position.lineNumber);
  const col = position.column - 1; // 0-based позиция курсора
  let i = col;
  while (i > 0) {
    const ch = lineText[i - 1];
    // пробел, скобки, операторы, кавычки, точка с запятой — стоп
    if (/\s/.test(ch)) break;
    if ("(),[]{}!|&+*\/:;\"'".indexOf(ch) >= 0) break;
    // `=` `<` `>` — тоже стоп (сравнения)
    if (ch === "=" || ch === "<" || ch === ">" || ch === "%") break;
    // минус — стоп (арифметика), кроме случая, когда он внутри числа;
    // для RQL-алиасов минус не встречается — упрощаем.
    if (ch === "-") break;
    i--;
  }
  return {
    startColumn: i + 1, // 1-based
    tokenText: lineText.slice(i, col),
  };
}

/** Члены для @root: null — «не знаю», пустой массив — «нет членов». */
function getRqlAliasMembers(
  root: string,
  ctx: ProviderContext,
): Array<{ label: string; detail?: string; documentation?: string }> | null {
  if (root === "doc") {
    // Все атрибуты всех сущностей текущего домена (плоско).
    const cur = (ctx.currentDomainId || "").toLowerCase();
    const seen = new Set<string>();
    const out: Array<{
      label: string;
      detail?: string;
      documentation?: string;
    }> = [];

    // Системные атрибуты — всегда доступны.
    for (const sys of [
      ["id", "Системный: идентификатор объекта"],
      ["label", "Системный: лейбл объекта"],
      ["createdAt", "Системный: дата создания"],
      ["updatedAt", "Системный: дата изменения"],
      ["createdBy", "Системный: кто создал"],
      ["updatedBy", "Системный: кто обновил"],
      ["organizationId", "Системный: организация"],
      ["version", "Системный: версия объекта"],
      ["domainId", "Системный: домен"],
      ["entityId", "Системный: сущность"],
    ] as const) {
      seen.add(sys[0]);
      out.push({ label: sys[0], detail: sys[1] });
    }

    ctx.modelIndex?.entities?.forEach((e: any) => {
      if ((e.domainId || "").toLowerCase() !== cur) return;
      e.attributes?.forEach((a: any) => {
        if (!a?.id || seen.has(a.id)) return;
        seen.add(a.id);
        const parts: string[] = [];
        if (a.dataType) parts.push(a.dataType);
        if (a.description) parts.push(a.description);
        parts.push(`entity: ${e.entityId}`);
        out.push({
          label: a.id,
          detail: parts.join(" · "),
        });
        a.nestedAttributes?.forEach((na: any) => {
          if (!na?.id || seen.has(na.id)) return;
          seen.add(na.id);
          out.push({
            label: na.id,
            detail: `${na.dataType || ""} · table: ${e.entityId}.${a.id}`,
          });
        });
      });
    });
    return out;
  }

  if (root === "row") {
    // Колонки из Table-атрибутов текущего домена (плоско).
    const cur = (ctx.currentDomainId || "").toLowerCase();
    const seen = new Set<string>();
    const out: Array<{ label: string; detail?: string }> = [];
    ctx.modelIndex?.dataTypes?.forEach((dt: any) => {
      if ((dt.domainId || "").toLowerCase() !== cur) return;
      if (dt.kind !== "Table") return;
      (dt.columns || []).forEach((c: string) => {
        if (seen.has(c)) return;
        seen.add(c);
        out.push({ label: c, detail: `колонка Table ${dt.id}` });
      });
    });
    return out;
  }

  if (root === "CurrentUser") {
    return [
      { label: "id", detail: "Идентификатор текущего пользователя" },
      { label: "username", detail: "Имя текущего пользователя" },
    ];
  }

  if (
    root === "CurrentDate" ||
    root === "CurrentTime" ||
    root === "CurrentTimestamp" ||
    root === "CurrentDateTime" ||
    root === "CurrentDayOfWeek" ||
    root === "index"
  ) {
    return [];
  }

  // @enumX / @workflowX — из dataTypes текущего домена
  const cur = (ctx.currentDomainId || "").toLowerCase();
  const dt = ctx.modelIndex?.dataTypes?.find(
    (d: any) => (d.domainId || "").toLowerCase() === cur && d.id === root,
  );
  if (dt) {
    if (dt.kind === "Enum" && Array.isArray(dt.values)) {
      return (dt.values as string[]).map((v) => ({
        label: v,
        detail: `значение Enum ${dt.id}`,
      }));
    }
    if (dt.kind === "Workflow" && Array.isArray(dt.statuses)) {
      return (dt.statuses as string[]).map((s) => ({
        label: s,
        detail: `статус Workflow ${dt.id}`,
      }));
    }
  }

  return null;
}

/** Список предложений для @root[.prefix]. */
function buildRqlAliasCompletions(
  model: any,
  position: any,
  Kind: any,
  ctx: ProviderContext,
): { suggestions: any[] } | null {
  const { startColumn, tokenText } = scanRqlToken(model, position);
  if (!tokenText.startsWith("@")) return null;

  const dot = tokenText.indexOf(".");
  const root = dot < 0 ? tokenText.slice(1) : tokenText.slice(1, dot);
  const prefix = "@" + root;
  const afterDot = dot >= 0 ? tokenText.slice(dot + 1) : "";

  const members = getRqlAliasMembers(root, ctx);

  const range = {
    startLineNumber: position.lineNumber,
    startColumn,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  };

  const suggestions: any[] = [];

  // Если root известен — предлагаем его члены @root.<member>.
  if (members && members.length > 0) {
    for (const m of members) {
      const full = prefix + "." + m.label;
      suggestions.push({
        label: full,
        insertText: full,
        filterText: full,
        sortText: "0_" + m.label,
        kind: Kind.Field,
        detail: m.detail,
        documentation: m.documentation,
        range,
      });
    }
    // Если курсор стоит сразу после точки (@doc.|), root уже не нужен в списке.
    // Если пользователь только начал набирать @doc (без точки) — добавим
    // и сам @doc в конце, чтобы не мешал.
    if (dot < 0 && afterDot === "") {
      // Только @root введено: предложим и сам @root как fallback
      // (например, для сравнения `@CurrentUser = @doc.createdBy`).
      suggestions.push({
        label: prefix,
        insertText: prefix,
        filterText: prefix,
        sortText: "9_" + prefix,
        kind: Kind.Variable,
        detail: "псевдоним целиком",
        range,
      });
    }
    return { suggestions };
  }

  // Root неизвестен — общий список RQL-конструкций.
  return { suggestions: buildRqlSuggestions(model, position, Kind, ctx) };
}

/** Список RQL-конструкций для автокомплита. */
function buildRqlSuggestions(
  model: any,
  position: any,
  Kind: any,
  ctx: ProviderContext,
): any[] {
  const word = model.getWordUntilPosition(position);
  const range = {
    startLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endLineNumber: position.lineNumber,
    endColumn: word.endColumn,
  };

  const out: any[] = [];
  const push = (
    label: string,
    kind: number,
    detail: string,
    sortText?: string,
  ) => {
    out.push({
      label,
      kind,
      insertText: label,
      filterText: label,
      sortText: sortText ?? label,
      detail,
      documentation: detail,
      range,
    });
  };

  // ---- Псевдонимы объектов (без точки — чтобы не ломать range на `.`) ----
  const aliases: Array<[string, string]> = [
    ["@doc", "Текущий объект (сущность, к которой применяется правило)"],
    ["@row", "Текущая строка таблицы (для атрибутов типа Table)"],
    ["@index", "Индекс элемента массива / строки таблицы"],
    ["@CurrentUser", "Объект текущего пользователя"],
    ["@CurrentDate", "Текущая дата"],
    ["@CurrentTime", "Текущее время"],
    ["@CurrentTimestamp", "Текущая метка времени"],
    ["@CurrentDateTime", "Текущая дата-время"],
    ["@CurrentDayOfWeek", "Название текущего дня недели (en)"],
  ];
  aliases.forEach(([a, d]) => push(a, Kind.Variable, d, "0_" + a));

  // ---- Функции (верхний уровень RQL) ----
  const functions: Array<[string, string]> = [
    ["has", "has(array, value) — есть ли value в поле-массиве"],
    ["hasAll", "hasAll(array, values) — все значения массива присутствуют"],
    ["hasAny", "hasAny(array, values) — хотя бы одно значение"],
    ["hasRole", "hasRole('roleName') — текущий пользователь имеет роль"],
    [
      "hasUserGroup",
      "hasUserGroup('groupName') — пользователь входит в группу",
    ],
    ["isSuperAdmin", "isSuperAdmin() — текущий пользователь — суперадмин"],
    ["select", "select(expr, from(...), where(...), ...)"],
    ["from", "from('current', @entity, @alias)"],
    ["join", "join('domain', @entity, @alias, on(...))"],
    ["where", "where(condition)"],
    ["group", "group(field, ...)"],
    ["having", "having(aggregate_condition)"],
    ["order", "order(asc(field) | desc(field))"],
    ["limit", "limit(N)"],
    ["and", "and(a, b)"],
    ["or", "or(a, b)"],
    ["not", "not(a)"],
    ["eq", "eq(a, b) — a = b"],
    ["ne", "ne(a, b) — a ≠ b"],
    ["lt", "lt(a, b) — a < b"],
    ["gt", "gt(a, b) — a > b"],
    ["lte", "lte(a, b) — a ≤ b"],
    ["gte", "gte(a, b) — a ≥ b"],
    ["like", "like(a, 'pattern') — шаблон LIKE"],
    ["in", "in(a, b) — вхождение во множество"],
    ["cast", "CAST(value, 'TYPE') — приведение типа"],
    ["count", "count(expr) — агрегат"],
  ];
  functions.forEach(([a, d]) => push(a, Kind.Function, d, "1_" + a));

  // ---- Операторы и литералы ----
  const ops: Array<[string, string]> = [
    ["true", "логическое true"],
    ["false", "логическое false"],
    ["AND", "логическое И"],
    ["OR", "логическое ИЛИ"],
    ["NOT", "логическое НЕ"],
    ["IN", "вхождение в множество"],
    ["NOT IN", "не входит во множество"],
    ["IS NULL", "значение не задано"],
    ["IS NOT NULL", "значение задано"],
    ["LIKE", "поиск по шаблону"],
    ["NOT LIKE", "не соответствует шаблону"],
    ["BETWEEN", "нахождение в диапазоне"],
    ["NOT BETWEEN", "вне диапазона"],
  ];
  ops.forEach(([a, d]) => push(a, Kind.Keyword, d, "2_" + a));

  return out;
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
      const Kind = monaco.languages.CompletionItemKind;

      setTimeout(ensureSuggestDetailsVisible, 30);

      // ============ RQL-контекст: только RQL-конструкции ============
      // ============ RQL-контекст ============
      if (isInsideRql(model, position)) {
        // Сначала пробуем @root.member
        const aliasResult = buildRqlAliasCompletions(
          model,
          position,
          Kind,
          ctx,
        );
        if (aliasResult) return aliasResult;
        // Общий RQL-список
        return { suggestions: buildRqlSuggestions(model, position, Kind, ctx) };
      }

      // ============ Далее — обычная YAML-логика ============

      // ============ searching.attributes[]: массив ID атрибутов ============
      // Пользователь пишет `- <word>` (без `:`) внутри searching.attributes[].
      // YAML допускает как увеличивающий отступ списка, так и равный родительскому
      // ключу — поддерживаем оба варианта.
      {
        const lineText0 = model.getLineContent(position.lineNumber);
        const before0 = lineText0.slice(0, position.column - 1);
        const m0 = before0.match(/^(\s*)-\s+([\w]*)$/);
        if (m0) {
          const currentIndent = m0[1].length;
          let sawAttributes = false;
          let sawSearching = false;
          for (let i = position.lineNumber - 1; i >= 1; i--) {
            const l = model.getLineContent(i);
            if (!l.trim() || l.trim().startsWith("#")) continue;
            const lIndent = (l.match(/^(\s*)/) || ["", ""])[1].length;
            const trimmed = l.trim();

            // Пропускаем другие элементы этого же списка
            if (trimmed.startsWith("-")) continue;

            // Идём вверх только по строкам с indent ≤ текущего
            // (равенство — для same-indent list items).
            if (lIndent > currentIndent) continue;

            if (!sawAttributes && /^attributes\s*:/.test(trimmed)) {
              sawAttributes = true;
              continue;
            }
            if (sawAttributes && /^searching\s*:/.test(trimmed)) {
              sawSearching = true;
              break;
            }
            // Любой другой ключ на меньшем отступе — вышли из нужного контекста
            if (lIndent < currentIndent) break;
          }
          if (sawSearching) {
            const wordAtPos0 = model.getWordUntilPosition(position);
            const range0 = {
              startLineNumber: position.lineNumber,
              startColumn: wordAtPos0.startColumn,
              endLineNumber: position.lineNumber,
              endColumn: wordAtPos0.endColumn,
            };
            const attrs = cachedAttributes();
            return {
              suggestions: attrs.map((v) => ({
                label: v.label,
                kind: Kind.Field,
                insertText: v.label,
                filterText: v.label,
                sortText: v.sortText,
                detail: v.detail,
                documentation: v.documentation,
                range: range0,
              })),
            };
          }
        }
      }

      const lineText = model.getLineContent(position.lineNumber);
      const beforeCursor = lineText.slice(0, position.column - 1);
      const wordAtPos = model.getWordUntilPosition(position);
      const cur = (ctx.currentDomainId || "").toLowerCase();

      // === 1. Проверяем, value ли это (`field: value`) ===
      const fieldMatch = beforeCursor.match(
        /^(\s*)(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*["']?[\w./-]*["']?$/,
      );

      // === 2. Если НЕ value — field-name / root / snippets ===
      if (!fieldMatch) {
        const lineIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;

        if (lineIndent === 0 && /^[a-zA-Z_]*$/.test(beforeCursor)) {
          const rootItems = [
            ["id", "Уникальный идентификатор домена (FQDN)"],
            ["name", "Название домена"],
            ["version", "Версия схемы (SemVer)"],
            ["type", "Тип элемента экспертизы (domain)"],
            ["description", "Описание домена"],
            ["tags", "Теги"],
            ["author", "Автор схемы"],
            ["entities", "Сущности домена"],
            ["dataTypes", "Кастомные типы (Enum, Workflow, Table)"],
            ["linkages", "Связи сущностей"],
            ["sequences", "Последовательности для Identifier"],
            ["counterColorPatterns", "Цветовые схемы счётчиков"],
            ["trees", "Древовидные связи"],
            ["transitiveLinkages", "Транзитивные связи"],
            ["mixins", "Примеси"],
            ["dataRules", "Правила данных"],
            ["exchangeSettings", "Настройки импорта и экспорта объектов"],
            ["actions", "Действия"],
            ["medias", "Иконки"],
            ["views", "Представления"],
            ["widgets", "Доменные виджеты (для дашбордов)"],
            ["menus", "Меню домена"],
            ["permissions", "Разрешения действий и доступа к данным"],
            [
              "accessRules",
              "Правила доступа (scope create/edit/view/delete/launch)",
            ],
            ["localizations", "Локализации"],
            ["uiRules", "UI Rules"],
            ["uiPresets", "UI Presets"],
          ] as const;
          const range = {
            startLineNumber: position.lineNumber,
            startColumn: wordAtPos.startColumn,
            endLineNumber: position.lineNumber,
            endColumn: wordAtPos.endColumn,
          };
          return {
            suggestions: rootItems.map(([id, desc]) => ({
              label: id,
              kind: Kind.Module,
              insertText: id + ":",
              filterText: id,
              sortText: id,
              detail: desc,
              range,
            })),
          };
        }

        const context = detectContextAtPosition(
          model,
          position,
          ctx.lineMap?.lineContexts || new Map(),
        );
        if (!context) return { suggestions: [] };

        const rawIndent = (lineText.match(/^(\s*)/) || ["", ""])[1];
        const currentIndent = "  ".repeat(Math.floor(rawIndent.length / 2));
        const hasDash = /^\s*-/.test(beforeCursor);
        const suggestions: any[] = [];
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
        const fields = FIELD_DEFINITIONS[context];
        if (fields) {
          const range = {
            startLineNumber: position.lineNumber,
            startColumn: wordAtPos.startColumn,
            endLineNumber: position.lineNumber,
            endColumn: wordAtPos.endColumn,
          };
          fields.forEach((f) =>
            suggestions.push(buildFieldSuggestion(monaco, f, range)),
          );
        }
        return { suggestions };
      }

      // === 3. Value — switch по fieldName, СБОР ТОЛЬКО НУЖНОГО ===
      const fieldName = fieldMatch[2];
      const vctx = detectValueContext(model, position);

      const r = buildValueCompletion; // сокращение
      // ============ Boolean-поля: только true / false ============
      if (BOOLEAN_FIELD_NAMES.has(fieldName)) {
        return (
          r(
            model,
            position,
            [fieldName],
            mkSimple(["true", "false"], Kind.Value, {
              true: "логическое true",
              false: "логическое false",
            }),
            Kind,
          ) || { suggestions: [] }
        );
      }

      switch (fieldName) {
        case "initial": {
          if (vctx.section !== "dataTypes") return { suggestions: [] };
          const statuses = getDataTypeStatuses(model, position);
          if (statuses.length === 0) return { suggestions: [] };
          return (
            r(
              model,
              position,
              ["initial"],
              mkSimple(statuses, Kind.EnumMember, {
                ...statuses.reduce(
                  (acc, s) => ({ ...acc, [s]: `Статус workflow` }),
                  {},
                ),
              }),
              Kind,
            ) || { suggestions: [] }
          );
        }
        case "from":
        case "to": {
          // Только внутри dataTypes[].transitions[]
          if (vctx.section !== "dataTypes") return { suggestions: [] };
          if (vctx.container !== "transitions") return { suggestions: [] };
          const statuses = getDataTypeStatuses(model, position);
          const items = ["*", ...statuses];
          return (
            r(
              model,
              position,
              ["from", "to"],
              mkSimple(items, Kind.Value, {
                "*": "Любой статус",
              }),
              Kind,
            ) || { suggestions: [] }
          );
        }
        // ---------- dataType ----------
        case "dataType": {
          // NEW: drag_drop_area.context.dataType
          if (vctx.itemType === "viewWidgetDragDropContext") {
            return (
              r(
                model,
                position,
                ["dataType"],
                mkSimple(["Array", "Attachment", "Table"], Kind.Value, {
                  Array: "Массив вложений",
                  Attachment: "Одно вложение",
                  Table: "Таблица вложений",
                }),
                Kind,
              ) || { suggestions: [] }
            );
          }

          if (vctx.section === "dataTypes" && vctx.itemType === "dataType") {
            return (
              r(
                model,
                position,
                ["dataType"],
                mkSimple(["Enum", "Table", "Workflow"], Kind.Value, {
                  Enum: "Перечисление — фиксированный список значений",
                  Table: "Таблица — структурированные данные (строки/колонки)",
                  Workflow: "Рабочий процесс — статусы и переходы",
                }),
                Kind,
              ) || { suggestions: [] }
            );
          }
          const base: RefSuggestion[] = BASE_DATA_TYPES_COMPLETION.map((t) => ({
            label: t,
            insertText: " " + t,
            kind: Kind.Value,
            sortText: "0_" + t,
            documentation: BASE_DATA_TYPE_DESCRIPTIONS[t],
          }));
          const custom: RefSuggestion[] = [];
          const seen = new Set<string>();
          ctx.modelIndex.dataTypes
            .filter((dt: any) => (dt.domainId || "").toLowerCase() === cur)
            .forEach((dt: any) => {
              if (!dt?.id || seen.has(dt.id)) return;
              seen.add(dt.id);
              const parts: string[] = [];
              if (dt.kind) parts.push(dt.kind);
              if (dt.description) parts.push(dt.description);
              if (dt.kind === "Enum" && typeof dt.valuesCount === "number")
                parts.push(`${dt.valuesCount} значений`);
              if (
                dt.kind === "Workflow" &&
                typeof dt.statusesCount === "number"
              )
                parts.push(`${dt.statusesCount} статусов`);
              if (dt.kind === "Table" && typeof dt.attributesCount === "number")
                parts.push(`${dt.attributesCount} колонок`);
              custom.push({
                label: dt.id,
                insertText: " " + dt.id,
                kind:
                  dt.kind === "Enum"
                    ? Kind.Enum
                    : dt.kind === "Workflow"
                      ? Kind.Interface
                      : Kind.Struct,
                sortText: "1_" + dt.id,
                documentation: parts.join(" · "),
              });
            });
          return (
            r(model, position, ["dataType"], [...base, ...custom], Kind) || {
              suggestions: [],
            }
          );
        }

        // ---------- type ----------
        case "type": {
          const map: Record<
            string,
            { list: string[]; desc?: Record<string, string> }
          > = {
            view: {
              list: [
                "entity",
                "list",
                "tree",
                "tabs_list",
                "dashboard",
                "dashboard_tree",
              ],
            },
            viewNested: { list: ["panel", "modal", "page"] },
            widget: {
              list: Object.keys(WIDGET_TYPE_DESCRIPTIONS),
              desc: WIDGET_TYPE_DESCRIPTIONS,
            },
            group: {
              list: ["block", "form", "tab", "tabs", "resizable_block_pair"],
            },
            action: {
              list: Object.keys(ACTION_TYPE_DESCRIPTIONS),
              desc: ACTION_TYPE_DESCRIPTIONS,
            },
            linkage: { list: ["1_1", "1_n", "n_n"] },
            dataType: { list: ["Enum", "Table", "Workflow"] },
            tree: { list: ["ordinary", "orderable", "multiparent"] },
            viewWidgetControl: {
              list: Object.keys(CONTROL_TYPE_DESCRIPTIONS),
              desc: CONTROL_TYPE_DESCRIPTIONS,
            },
            viewWidgetLinkageControl: {
              list: ["select", "multi_select", "table", "list", "tree"],
            },
            reconciliationMergeStrategy: {
              list: RECONCILIATION_MERGE_STRATEGIES.map(([t]) => t),
              desc: RECONCILIATION_MERGE_LABELS,
            },
            menu: {
              list: ["root_group", "root_menu"],
              desc: {
                root_group: "Раздел с подразделами (левое меню)",
                root_menu: "Отдельный пункт в главном меню",
              },
            },
            menuItem: {
              list: ["menu"],
              desc: { menu: "Подраздел в группе" },
            },
            media: {
              list: ["icon_name", "data"],
              desc: {
                icon_name: "Иконка из дизайн-системы",
                data: "Base64-строка",
              },
            },
            viewTableColumnControl: {
              list: Object.keys(CONTROL_TYPE_DESCRIPTIONS),
              desc: CONTROL_TYPE_DESCRIPTIONS,
            },
            treeNodeType: {
              list: ["root", "branch", "leaf"],
              desc: {
                root: "Корень дерева вложения",
                branch: "Ветка дерева вложения",
                leaf: "Лист дерева вложения",
              },
            },
            viewDashboardLayout: {
              list: ["grid"],
              desc: { grid: "Расположение виджетов сеткой" },
            },
          };
          const entry = map[vctx.itemType];
          return entry
            ? r(
                model,
                position,
                ["type"],
                mkSimple(entry.list, Kind.Value, entry.desc),
                Kind,
              ) || { suggestions: [] }
            : { suggestions: [] };
        }

        // ---------- effect ----------
        case "effect": {
          let list: string[] | null = null;
          if (vctx.itemType === "dataRuleRule")
            list = ["hidden", "readonly", "required", "default", "allowed"];
          else if (vctx.itemType === "uiRuleRule")
            list = [
              "hidden",
              "show",
              "hiddenEmpty",
              "readonly",
              "editable",
              "inherit",
              "variant",
            ];
          return list
            ? r(
                model,
                position,
                ["effect"],
                mkSimple(list, Kind.Value, EFFECT_DESCRIPTIONS),
                Kind,
              ) || { suggestions: [] }
            : { suggestions: [] };
        }

        // ---------- target ----------
        case "target": {
          let list: string[] | null = null;
          if (vctx.itemType === "dataRule")
            list = ["entity", "entityAttribute", "linkage"];
          else if (vctx.itemType === "uiRule")
            list = ["list_view", "entity_view", "entity_attribute"];
          else if (vctx.itemType === "accessRule")
            list = [
              "entity",
              "action",
              "linkage",
              "any_entity",
              "any_action",
              "any_linkage",
            ];
          return list
            ? r(
                model,
                position,
                ["target"],
                mkSimple(list, Kind.Value, TARGET_DESCRIPTIONS),
                Kind,
              ) || { suggestions: [] }
            : { suggestions: [] };
        }

        case "direction": {
          let list: string[] | null = null;
          if (vctx.container === "layout") list = ["column", "row"];
          else if (
            vctx.itemType === "sortingByItem" ||
            vctx.container === "by" ||
            vctx.container === "defaults"
          )
            list = ["asc", "desc"];
          return list
            ? r(
                model,
                position,
                ["direction"],
                mkSimple(list, Kind.Value, {
                  column: "Вертикальное размещение",
                  asc: "По возрастанию",
                  desc: "По убыванию",
                }),
                Kind,
              ) || { suggestions: [] }
            : { suggestions: [] };
        }
        case "mode":
          return vctx.container === "search"
            ? r(
                model,
                position,
                ["mode"],
                mkSimple(["entity", "linkage", "both"], Kind.Value, {
                  entity: "Искать по атрибутам связанной сущности",
                  linkage: "Искать по атрибутам связи",
                  both: "Искать и по сущности, и по связи",
                }),
                Kind,
              ) || { suggestions: [] }
            : { suggestions: [] };
        case "placement":
          return (
            r(
              model,
              position,
              ["placement"],
              mkSimple(["top", "settings"], Kind.Value, {
                top: "Главное меню",
                settings: "Раздел Настройки",
              }),
              Kind,
            ) || { suggestions: [] }
          );
        case "defaultViewMode": {
          return (
            r(
              model,
              position,
              ["defaultViewMode"],
              mkSimple(["cola", "horizontal", "vertical"], Kind.Value, {
                cola: "Центральное упорядочивание",
                horizontal: "Горизонтально",
                vertical: "Вертикально",
              }),
              Kind,
            ) || { suggestions: [] }
          );
        }
        case "defaultGroupMode": {
          return (
            r(
              model,
              position,
              ["defaultGroupMode"],
              mkSimple(["cluster", "byEntity"], Kind.Value, {
                cluster: "Кластерная группировка",
                byEntity: "Группировка по сущности",
              }),
              Kind,
            ) || { suggestions: [] }
          );
        }
        case "operation": {
          const allLines: string[] = [];
          const lineCount = model.getLineCount();
          for (let k = 1; k <= lineCount; k++) {
            allLines.push(model.getLineContent(k));
          }
          const actionType = findActionTypeForLine(
            allLines,
            position.lineNumber,
          );
          const opMap: Record<string, string[]> = {
            open_modal: ["create", "edit"],
            open_page: ["create", "edit", "view"],
            bulk: ["remove", "edit", "edit_attribute", "import", "export"],
            tree_bulk: ["edit", "remove"],
          };
          const list = actionType ? opMap[actionType] : null;
          return list
            ? r(
                model,
                position,
                ["operation"],
                mkSimple(list, Kind.Value, {
                  create: "Создать объект",
                  edit: "Редактировать объект",
                  view: "Просмотреть объект",
                  remove: "Удалить объект",
                  edit_attribute: "Изменить атрибут",
                  import: "Импортировать",
                  export: "Экспортировать",
                }),
                Kind,
              ) || { suggestions: [] }
            : { suggestions: [] };
        }
        case "page": {
          const allLines: string[] = [];
          const lineCount = model.getLineCount();
          for (let k = 1; k <= lineCount; k++) {
            allLines.push(model.getLineContent(k));
          }
          const actionType = findActionTypeForLine(
            allLines,
            position.lineNumber,
          );
          const allowed = ["open_list", "open_tree", "open_view"];
          if (actionType && allowed.includes(actionType)) {
            return (
              r(
                model,
                position,
                ["page"],
                mkSimple(["blank", "current"], Kind.Value, {
                  blank: "Отобразить в отдельном окне",
                  current: "Отобразить в текущем окне",
                }),
                Kind,
              ) || { suggestions: [] }
            );
          }
          return { suggestions: [] };
        }
        case "side": {
          return (
            r(
              model,
              position,
              ["side"],
              mkSimple(["1", "2"], Kind.Value, {
                "1": "Первая сторона",
                "2": "Вторая сторона",
              }),
              Kind,
            ) || { suggestions: [] }
          );
        }

        // ---------- entity refs ----------
        case "iconColor": {
          if (
            vctx.container === "graphView" ||
            (vctx.section === "linkages" && vctx.container === "view")
          ) {
            return (
              r(
                model,
                position,
                ["iconColor"],
                mkSimple(
                  GRAPH_VIEW_COLORS.map(([c]) => c),
                  Kind.EnumMember,
                  GRAPH_VIEW_COLOR_LABELS,
                ),
                Kind,
              ) || { suggestions: [] }
            );
          }
          return { suggestions: [] };
        }
        case "inherits":
        case "entity":
        case "side1":
        case "side2": {
          const refs = collectRefsForField(
            cachedEntities(),
            ctx.currentDomainId,
            {
              shortKind: Kind.Class,
            },
          );
          return (
            r(
              model,
              position,
              ["inherits", "entity", "side1", "side2"],
              refs,
              Kind,
            ) || { suggestions: [] }
          );
        }

        // ---------- простые ref-поля ----------
        case "linkage":
          return (
            r(
              model,
              position,
              ["linkage"],
              collectRefsForField(cachedLinkages(), ctx.currentDomainId, {
                shortKind: Kind.Reference,
              }),
              Kind,
            ) || { suggestions: [] }
          );
        case "widget":
          return (
            r(
              model,
              position,
              ["widget"],
              collectRefsForField(cachedWidgets(), ctx.currentDomainId, {
                shortKind: Kind.Reference,
              }),
              Kind,
            ) || { suggestions: [] }
          );
        case "group":
          return (
            r(
              model,
              position,
              ["group"],
              collectRefsForField(cachedGroups(), ctx.currentDomainId, {
                shortKind: Kind.Reference,
              }),
              Kind,
            ) || { suggestions: [] }
          );
        case "column":
          return (
            r(
              model,
              position,
              ["column"],
              collectRefsForField(cachedColumns(), ctx.currentDomainId, {
                shortKind: Kind.Reference,
              }),
              Kind,
            ) || { suggestions: [] }
          );
        case "action":
          return (
            r(
              model,
              position,
              ["action"],
              collectRefsForField(cachedActions(), ctx.currentDomainId, {
                shortKind: Kind.Reference,
              }),
              Kind,
            ) || { suggestions: [] }
          );
        case "sequence":
          return (
            r(
              model,
              position,
              ["sequence"],
              collectRefsForField(cachedSequences(), ctx.currentDomainId, {
                shortKind: Kind.Reference,
              }),
              Kind,
            ) || { suggestions: [] }
          );
        case "counterColorPattern":
          return (
            r(
              model,
              position,
              ["counterColorPattern"],
              collectRefsForField(cachedCounterColors(), ctx.currentDomainId, {
                shortKind: Kind.Reference,
              }),
              Kind,
            ) || { suggestions: [] }
          );
        case "menuItem":
          return (
            r(
              model,
              position,
              ["menuItem"],
              collectRefsForField(cachedMenus(), ctx.currentDomainId, {
                shortKind: Kind.Reference,
              }),
              Kind,
            ) || { suggestions: [] }
          );
        case "preset":
          return (
            r(
              model,
              position,
              ["preset"],
              collectRefsForField(cachedUiPresets(), ctx.currentDomainId, {
                shortKind: Kind.EnumMember,
              }),
              Kind,
            ) || { suggestions: [] }
          );

        case "segment": {
          // segment — массив литералов (можно с @, можно без).
          // Monaco в YAML-режиме в массив-элементах выдаёт value-suggestions через
          // тот же механизм, что и для `- attr:`.
          return (
            r(
              model,
              position,
              ["segment"],
              mkSimple(["@prefix", "@YYYY", "@YY", "@MM", "@DD"], Kind.Value, {
                "@prefix":
                  "Настраиваемый префикс (правила подстановки или defaultPrefix)",
                "@YYYY": "Текущий год, 4 цифры",
                "@YY": "Текущий год, 2 цифры",
                "@MM": "Текущий месяц, 01–12",
                "@DD": "Текущий день месяца, 01–31",
              }),
              Kind,
            ) || { suggestions: [] }
          );
        }
        case "tree":
          return (
            r(
              model,
              position,
              ["tree"],
              collectRefsForField(cachedTrees(), ctx.currentDomainId, {
                shortKind: Kind.Reference,
              }),
              Kind,
            ) || { suggestions: [] }
          );

        // ---------- attribute / scenario ----------
        case "attribute": {
          const items = withKind(cachedAttributes(), Kind.Field);
          return (
            r(model, position, ["attribute"], items, Kind) || {
              suggestions: [],
            }
          );
        }
        case "scenario": {
          const items = withKind(cachedScenarios(), Kind.Reference);
          return (
            r(model, position, ["scenario"], items, Kind) || { suggestions: [] }
          );
        }

        // ---------- view / modal / panel / form / addLinksView ----------
        case "modal": {
          const views = cachedViews();
          const refs = collectRefsForField(views, ctx.currentDomainId, {
            shortKind: Kind.Reference,
            typeFilter: "modal",
          });
          return (
            r(model, position, ["modal"], refs, Kind) || { suggestions: [] }
          );
        }
        case "panel": {
          const views = cachedViews();
          const refs = collectRefsForField(views, ctx.currentDomainId, {
            shortKind: Kind.Reference,
            typeFilter: "panel",
          });
          return (
            r(model, position, ["panel"], refs, Kind) || { suggestions: [] }
          );
        }
        case "addLinksView": {
          const views = cachedViews().filter(
            (v) => v.type === "list" || v.type === "tabs_list",
          );
          const refs = collectRefsForField(views, ctx.currentDomainId, {
            shortKind: Kind.Reference,
          });
          return (
            r(model, position, ["addLinksView"], refs, Kind) || {
              suggestions: [],
            }
          );
        }
        case "form": {
          const groups = cachedGroups().filter((g) => g.type === "form");
          const refs = collectRefsForField(groups, ctx.currentDomainId, {
            shortKind: Kind.Reference,
          });
          return (
            r(model, position, ["form"], refs, Kind) || { suggestions: [] }
          );
        }
        case "view": {
          let items = cachedViews();
          if (
            vctx.itemType === "menu" ||
            vctx.itemType === "menuItem" ||
            vctx.itemType === "action"
          ) {
            items = items.filter((v) =>
              [
                "list",
                "tabs_list",
                "tree",
                "dashboard",
                "dashboard_tree",
              ].includes(v.type || ""),
            );
          }
          const refs = collectRefsForField(items, ctx.currentDomainId, {
            shortKind: Kind.Reference,
          });
          return (
            r(model, position, ["view"], refs, Kind) || { suggestions: [] }
          );
        }
        case "kind": {
          if (vctx.container === "constraints") {
            return (
              r(
                model,
                position,
                ["kind"],
                mkSimple(
                  [
                    "required",
                    "range",
                    "length",
                    "regexp",
                    "size",
                    "mime_types",
                    "unique",
                  ],
                  Kind.Value,
                  {
                    required: "Значение не должно быть пустым",
                    range: "Число в диапазоне min..max",
                    length: "Длина строки от min до max",
                    regexp: "Строка соответствует регулярному выражению",
                    size: "Размер файла от min до max",
                    mime_types: "Допустимые MIME-типы вложения",
                    unique:
                      "Уникальное значение (String/Integer/Uuid/Reference/Array/Table)",
                  },
                ),
                Kind,
              ) || { suggestions: [] }
            );
          }
          // NEW: entities[].kind
          if (vctx.section === "entities" && vctx.itemType === "entity") {
            return (
              r(
                model,
                position,
                ["kind"],
                mkSimple(["abstract", "regular", "static"], Kind.Value, {
                  abstract: "Абстрактная сущность (только наследование)",
                  regular: "Стандартная сущность (по умолчанию)",
                  static: "Статическая сущность (без создания экземпляров)",
                }),
                Kind,
              ) || { suggestions: [] }
            );
          }

          // NEW: accessRules scope item
          if (vctx.itemType === "accessRuleItem") {
            return (
              r(
                model,
                position,
                ["kind"],
                mkSimple(["permission", "pass", "condition"], Kind.Value, {
                  permission: "Разрешить всё для обработки (с исключениями)",
                  pass: "Пропустить всё для обработки (с исключениями)",
                  condition: "Разрешить обработку при выполнении RQL-условия",
                }),
                Kind,
              ) || { suggestions: [] }
            );
          }

          return { suggestions: [] };
        }
        case "displayMode": {
          if (vctx.section === "views" && vctx.container === "control") {
            return (
              r(
                model,
                position,
                ["displayMode"],
                mkSimple(["flat", "grouped"], Kind.Value, {
                  flat: "Плоская таблица (для транзитивных связей)",
                  grouped:
                    "Группировка по первому звену цепочки (для транзитивных связей)",
                }),
                Kind,
              ) || { suggestions: [] }
            );
          }
          return { suggestions: [] };
        }
      }

      return { suggestions: [] };
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

const BASE_DATA_TYPES_SET = new Set<string>([
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
]);

const TYPE_ENUM_BY_CTX: Record<string, string[]> = {
  // ===== views =====
  "views|view": [
    "entity",
    "list",
    "tree",
    "tabs_list",
    "dashboard",
    "dashboard_tree",
  ],
  "views|viewNested": ["panel", "modal", "page"],
  "views|widget": [
    "attribute",
    "action",
    "linkage",
    "linkage_list",
    "linked_objects_groups",
    "join",
    "history",
    "runs_history",
    "comments",
    "card",
    "conversation",
    "visualization",
    "calculation",
    "template_editor",
    "addressBook",
  ],
  "views|group": ["block", "form", "tab", "tabs", "resizable_block_pair"],

  // ===== control внутри widget =====
  "views|viewWidgetControl": [
    "uuid",
    "text",
    "text_area",
    "date",
    "time",
    "timestamp",
    "timestamp_range",
    "integer",
    "decimal",
    "float",
    "integer_slider",
    "decimal_slider",
    "float_slider",
    "bool_text",
    "checkbox",
    "switch",
    "select",
    "level",
    "radio",
    "multi_select",
    "mitre_multi_select",
    "tag_list",
    "tag",
    "ip",
    "mac",
    "cidr",
    "file",
    "link",
    "url",
    "counter",
    "tree_path",
    "drag_drop_area",
    "rql",
    "external",
  ],
  "views|viewWidgetLinkageControl": [
    "select",
    "tag",
    "link",
    "text",
    "multi_select",
    "mitre_multi_select",
    "table",
    "list",
    "tree",
  ],
  "views|viewWidgetActionControl": [
    "regular_button",
    "dropdown",
    "drag_drop_area",
  ],
  "views|viewButtonControl": ["regular_button"],

  // ===== прочие type-поля views =====
  "views|viewSourceType": ["operational"],
  "views|viewTableActionType": [
    "row_click",
    "row_double_click",
    "row_context_menu",
  ],
  "views|viewButtonType": ["submit", "close"],
  "views|viewFilterAttributesType": ["specific", "all"],
  "views|viewFilterLinkagesType": ["specific", "all"],

  // ===== другие секции =====
  "actions|action": [
    "open_panel",
    "open_modal",
    "open_page",
    "open_graph_view",
    "open_board_view",
    "open_list",
    "open_tree",
    "open_view",
    "remove",
    "bulk",
    "tree_bulk",
    "set_attribute_value",
    "automation",
    "scenario",
    "generate_qr_code",
    "copy_entity_link",
    "open_external_widget_modal",
  ],
  "linkages|linkage": ["1_1", "1_n", "n_n"],
  "dataTypes|dataType": ["Enum", "Table", "Workflow"],
  "trees|tree": ["ordinary", "orderable", "multiparent"],
  "entities|attributeConstraint": [
    "required",
    "range",
    "length",
    "regexp",
    "size",
    "mime_types",
    "unique",
  ],
  "linkages|attributeConstraint": [
    "required",
    "range",
    "length",
    "regexp",
    "size",
    "mime_types",
    "unique",
  ],
  // ===== entities =====
  "entities|reconciliationMergeStrategy": [
    "replace",
    "array_merge",
    "array_concat",
    "earliest_date",
    "latest_date",
  ],
  dataRules: ["entity", "entityAttribute"],
  "menus|menu": ["root_group", "root_menu"],
  "menus|menuItem": ["menu"],
  "medias|media": ["icon_name", "data"],
  "views|viewTableColumnControl": [
    "uuid",
    "text",
    "text_area",
    "date",
    "time",
    "timestamp",
    "timestamp_range",
    "integer",
    "decimal",
    "float",
    "integer_slider",
    "decimal_slider",
    "float_slider",
    "bool_text",
    "checkbox",
    "switch",
    "select",
    "level",
    "radio",
    "multi_select",
    "mitre_multi_select",
    "tag_list",
    "tag",
    "ip",
    "mac",
    "cidr",
    "file",
    "link",
    "url",
    "counter",
    "tree_path",
    "drag_drop_area",
    "rql",
    "external",
  ],
  "entities|treeNodeType": ["root", "branch", "leaf"],
  "views|viewDashboardLayout": ["grid"],
  "views|viewWidgetDragDropContext": ["Array", "Attachment", "Table"],
};

const EFFECT_ENUM_BY_CTX: Record<string, string[]> = {
  dataRuleRule: ["hidden", "readonly", "required", "default", "allowed"],
  uiRuleRule: [
    "hidden",
    "show",
    "hiddenEmpty",
    "readonly",
    "editable",
    "inherit",
    "variant",
  ],
};

const TARGET_ENUM_BY_CTX: Record<string, string[]> = {
  dataRule: ["entity", "entityAttribute"],
  uiRule: ["list_view", "entity_view", "entity_attribute"],
};

const OPERATION_ENUM_BY_ACTION_TYPE: Record<string, string[]> = {
  open_modal: ["create", "edit"],
  open_page: ["create", "edit", "view"],
  bulk: ["remove", "edit", "edit_attribute", "import", "export"],
  tree_bulk: ["edit", "remove"],
};

export function applyEnumFieldMarkers(monaco: any, model: any): void {
  try {
    const lines = model.getValue().split("\n");

    // ============ Pre-pass: line → ValueCtx (один forward проход) ============
    const ctxByLine: Array<ValueCtx | null> = new Array(lines.length + 1).fill(
      null,
    );
    let curSection = "";
    const stack: Array<{ indent: number; key: string; line: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim() || line.trim().startsWith("#")) {
        ctxByLine[i + 1] = i > 0 ? ctxByLine[i] : null;
        continue;
      }
      const indent = (line.match(/^(\s*)/) || ["", ""])[1].length;

      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      if (indent === 0) {
        const sm = line.match(/^([a-zA-Z_][\w]*)\s*:/);
        if (sm) {
          curSection = sm[1];
          stack.length = 0;
          ctxByLine[i + 1] = {
            section: curSection,
            container: "",
            itemType: "",
          };
        }
        continue;
      }

      const km = line.match(/^\s*(?:-\s+)?([a-zA-Z_][\w]*)\s*:/);
      if (!km) {
        ctxByLine[i + 1] = i > 0 ? ctxByLine[i] : null;
        continue;
      }

      const key = km[1];

      // Контейнер — ближайший не-`id` ключ с меньшим отступом.
      // Для секции views сканируем ТЕКСТ (надёжнее стека),
      // для остальных — используем стек.
      let container = "";
      let containerIndent = -1;
      let containerIdx = -1;
      let containerLine = -1;

      if (curSection === "views") {
        const dc = determineViewContainer(lines, i + 1, indent);
        container = dc.container;
        containerLine = dc.containerLine;
        containerIndent = dc.containerIndent;
      } else {
        for (let s = stack.length - 1; s >= 0; s--) {
          if (stack[s].key !== "id" && stack[s].indent < indent) {
            container = stack[s].key;
            containerIndent = stack[s].indent;
            containerLine = (stack[s] as any).line ?? -1;
            containerIdx = s;
            break;
          }
        }
      }

      const itemType = computeItemTypeFast(
        lines,
        curSection,
        container,
        containerLine, // без + 1
        containerIndent,
        stack,
      );

      ctxByLine[i + 1] = { section: curSection, container, itemType };
      stack.push({ indent, key, line: i + 1 });
    }

    // ============ Scan: O(N) маркеров ============
    const markers: any[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fm = line.match(
        /^(\s*)(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*["']?([\w.-]+)["']?\s*(?:#.*)?$/,
      );
      if (!fm) continue;
      const fieldName = fm[2];
      const value = fm[3];
      if (!value) continue;

      const vctx = ctxByLine[i + 1];
      if (!vctx) continue;

      const fieldStart = line.indexOf(fieldName);
      const valueStart = line.indexOf(value, fieldStart + fieldName.length);
      if (valueStart < 0) continue;
      const startCol = valueStart + 1;
      const endCol = startCol + value.length;

      // ---- boolean ----
      if (BOOLEAN_FIELD_NAMES.has(fieldName)) {
        if (!["true", "false"].includes(value)) {
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `Поле "${fieldName}" ожидает boolean: true или false`,
            startLineNumber: i + 1,
            startColumn: startCol,
            endLineNumber: i + 1,
            endColumn: endCol,
            source: "enum-validator",
          });
        }
        continue;
      }

      let expected: string[] | null = null;
      let label = "";

      if (fieldName === "type") {
        expected = TYPE_ENUM_BY_CTX[`${vctx.section}|${vctx.itemType}`] || null;
        label = "тип";
      } else if (fieldName === "effect") {
        expected = EFFECT_ENUM_BY_CTX[vctx.itemType] || null;
        label = "эффект";
      } else if (fieldName === "target") {
        expected = TARGET_ENUM_BY_CTX[vctx.itemType] || null;
        label = "target";
      } else if (fieldName === "direction") {
        if (vctx.container === "layout") expected = ["column"];
        else if (
          vctx.itemType === "sortingByItem" ||
          vctx.container === "by" ||
          vctx.container === "defaults"
        )
          expected = ["asc", "desc"];
        label = "направление";
      } else if (fieldName === "mode" && vctx.container === "search") {
        expected = ["entity", "linkage", "both"];
        label = "режим поиска";
      } else if (fieldName === "placement") {
        expected = ["top", "settings"];
        label = "расположение";
      } else if (fieldName === "operation") {
        const actionType = findActionTypeForLine(lines, i + 1);
        if (actionType && OPERATION_ENUM_BY_ACTION_TYPE[actionType]) {
          expected = OPERATION_ENUM_BY_ACTION_TYPE[actionType];
          label = `operation для type: ${actionType}`;
        }
      } else if (fieldName === "page") {
        const actionType = findActionTypeForLine(lines, i + 1);
        if (
          actionType &&
          ["open_list", "open_tree", "open_view"].includes(actionType)
        ) {
          expected = ["blank", "current"];
          label = `page для type: ${actionType}`;
        }
      } else if (fieldName === "iconColor") {
        if (vctx.container === "graphView") {
          expected = GRAPH_VIEW_COLORS.map(([c]) => c);
          label = "цвет иконки";
        }
      }

      if (!expected || expected.includes(value)) continue;

      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message:
          `Недопустимое значение ${label} "${value}". ` +
          `Ожидается: ${expected.join(", ")}`,
        startLineNumber: i + 1,
        startColumn: startCol,
        endLineNumber: i + 1,
        endColumn: endCol,
        source: "enum-validator",
      });
    }

    monaco.editor.setModelMarkers(model, "enum-validator", markers);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[enum-validator]", err);
  }
}

/**
 * Сканирует YAML вверх от currentLineIdx (1-based) и возвращает ближайший
 * не-`id` ключ с меньшим indent. В отличие от стека, работает даже при
 * нестандартных отступах, потому что смотрит на текст, а не на состояние.
 */
function determineViewContainer(
  lines: string[],
  currentLineIdx: number,
  currentIndent: number,
): { container: string; containerLine: number; containerIndent: number } {
  for (let i = currentLineIdx - 1; i >= 1; i--) {
    const l = lines[i - 1];
    if (!l || !l.trim() || l.trim().startsWith("#")) continue;
    const lIndent = (l.match(/^(\s*)/) || ["", ""])[1].length;
    if (lIndent >= currentIndent) continue;

    const m = l.match(/^(\s*)(-\s+)?([a-zA-Z_][\w]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const isDash = !!m[2];
    const key = m[3];
    const rest = (m[4] || "").replace(/#.*$/, "").trim();

    if (key === "id") continue;

    // ============ Отличие «item opener» от «container» ============
    // `- buttons:` (dash) может быть:
    //   (a) полем item (первое поле) — currentIndent == "поля item";
    //   (b) контейнером — currentIndent > "поля item".
    // Определяем «поля item» = indent первого дочернего элемента после dash.
    // Пример:
    //   - buttons:            ← indent 6
    //       - type: close     ← indent 10 (V=10)
    //     form: ...           ← indent 8 (currentIndent=8 < V=10) → НЕ внутри
    if (isDash) {
      // Скалярное значение на той же строке — точно не контейнер.
      if (rest) continue;

      // Ищем V — indent первого вложенного элемента после `- key:`.
      let valueIndent = -1;
      for (let j = i; j < currentLineIdx; j++) {
        const nl = lines[j];
        if (!nl || !nl.trim() || nl.trim().startsWith("#")) continue;
        const nInd = (nl.match(/^(\s*)/) || ["", ""])[1].length;
        if (nInd > lIndent) {
          valueIndent = nInd;
          break;
        }
      }

      if (valueIndent > 0 && currentIndent < valueIndent) {
        // Текущая строка на уровне полей item, а не внутри key's value.
        continue;
      }
    }

    return { container: key, containerLine: i, containerIndent: lIndent };
  }
  return { container: "", containerLine: -1, containerIndent: -1 };
}

/** Быстрая замена detectValueContext: использует уже пройденный stack. */
function computeItemTypeFast(
  lines: string[],
  section: string,
  container: string,
  containerLine: number, // 1-based
  containerIndent: number,
  stack: Array<{ indent: number; key: string }>,
): string {
  // ===== entities / linkages =====
  if (section === "entities") {
    if (container === "constraints") return "attributeConstraint";
    if (container === "mergeStrategy") return "reconciliationMergeStrategy";
    if (container === "graphView") return "graphView";
    // ============ NEW: treeNode.types[] ============
    if (container === "types") return "treeNodeType";
    if (container === "of") return "treeNodeOf";
    if (container === "attributes") {
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s].indent >= containerIndent) continue;
        if (stack[s].key === "searching") return "searchingAttributesItem";
        break;
      }
      return "attribute";
    }
    return "entity";
  }
  if (section === "linkages") {
    if (container === "constraints") return "attributeConstraint";
    if (container === "attributes") return "linkageAttribute";
    return "linkage";
  }

  // ===== views =====
  if (section === "views") {
    if (container === "source") return "viewSourceType";
    if (container === "widgets") return "widget";
    if (container === "groups") return "group";
    if (container === "actions") return "viewTableActionType";
    if (container === "buttons") return "viewButtonType";

    // filter.attributes.type / filter.linkages.type
    if (container === "filter") return "";
    if (container === "attributes" || container === "linkages") {
      let parent = "";
      for (let s = stack.length - 1; s >= 0; s--) {
        if (
          stack[s].key !== "id" &&
          stack[s].key !== container &&
          stack[s].indent < containerIndent
        ) {
          parent = stack[s].key;
          break;
        }
      }
      if (parent === "filter") {
        return container === "attributes"
          ? "viewFilterAttributesType"
          : "viewFilterLinkagesType";
      }
      return "";
    }

    // control.type — зависит от widget.type / ancestor (buttons/footer)
    if (container === "control") {
      // Собираем ВСЕХ предков control: по стеку (у кого indent < containerIndent).
      // Ранний `break` не делаем — нужен весь набор, чтобы не терять `menu`,
      // `widgets`, `columns`, `actions` из-за промежуточного `action`/`id`.
      const ancestors = new Set<string>();
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s].indent >= containerIndent) continue;
        ancestors.add(stack[s].key);
      }

      // 1. Кнопки/футер модалки → viewButtonControl (Zod Z: только regular_button)
      if (ancestors.has("buttons") || ancestors.has("footer")) {
        return "viewButtonControl";
      }

      // 2. Меню панели → viewWidgetActionControl
      //    Zod T: regular_button | dropdown | drag_drop_area
      if (ancestors.has("menu")) {
        return "viewWidgetActionControl";
      }

      // 3. columns[].actions[].control → viewButtonControl (только regular_button)
      if (ancestors.has("actions") && ancestors.has("columns")) {
        return "viewButtonControl";
      }

      // 4. Прямой control колонки → viewTableColumnControl (attribute-control enum)
      if (ancestors.has("columns")) {
        return "viewTableColumnControl";
      }

      // 5. control внутри widgets[] → зависит от widget.type
      if (ancestors.has("widgets")) {
        const widgetType = findWidgetTypeForControl(lines, containerLine);
        if (widgetType === "action") return "viewWidgetActionControl";
        if (widgetType === "linkage") return "viewWidgetLinkageControl";
        if (widgetType === "linked_objects_groups") {
          // Zod: linked_objects_groups.control.type === "table"
          // (viewWidgetLinkageControl уже содержит "table" — не заводим отдельный enum).
          return "viewWidgetLinkageControl";
        }
        return "viewWidgetControl";
      }

      // Fallback — attribute-control (историческое поведение).
      return "viewWidgetControl";
    }

    // ============ NEW: layout — dashboard vs group ============
    if (container === "layout") {
      let itemLine = -1;
      let itemIndent = -1;
      for (let i = containerLine - 1; i >= 1; i--) {
        const l = lines[i - 1];
        if (!l || !l.trim() || l.trim().startsWith("#")) continue;
        const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (ind >= containerIndent) continue;
        const m = l.match(/^(\s*)-\s+id\s*:/);
        if (m) {
          itemLine = i;
          itemIndent = m[1].length;
          break;
        }
        if (ind === 0) break;
      }
      if (itemLine !== -1) {
        for (let i = itemLine + 1; i < containerLine; i++) {
          const l = lines[i - 1];
          if (!l || !l.trim()) continue;
          const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
          if (ind <= itemIndent) break;
          if (/^\s*type\s*:\s*dashboard\b/.test(l)) {
            return "viewDashboardLayout";
          }
        }
      }
      return "viewGroupLayout";
    }

    if (container === "context") return "viewWidgetDragDropContext";

    // прочие контейнеры без поля type
    if (
      container === "columns" ||
      container === "sortingBy" ||
      container === "defaults" ||
      container === "refresh" ||
      container === "paging" ||
      container === "empty" ||
      container === "selection" ||
      container === "items" ||
      container === "menu" ||
      container === "tabs" ||
      container === "footer" ||
      container === "actionPanel" ||
      container === "table" ||
      container === "joins"
    ) {
      return "";
    }

    // views[] — nested vs top-level
    if (container === "views") {
      // Nested, если у `views:` есть предок (indent < containerIndent),
      // открывающий dash-item. Не важно, какой ключ в dash —
      // `- id:`, `- entity:`, `- buttons:` — все они открывают item.
      let isNested = false;
      for (let i = containerLine - 1; i >= 1; i--) {
        const l = lines[i - 1];
        if (!l || !l.trim() || l.trim().startsWith("#")) continue;
        const lIndent = (l.match(/^(\s*)/) || ["", ""])[1].length;
        if (lIndent >= containerIndent) continue;
        if (/^\s*-\s+[a-zA-Z_][\w]*\s*:/.test(l)) {
          isNested = true;
          break;
        }
        if (lIndent === 0) break;
      }
      return isNested ? "viewNested" : "view";
    }

    return "";
  }

  // ===== dataTypes =====
  if (section === "dataTypes") {
    if (container === "control") return "viewWidgetControl";
    if (
      container === "columns" ||
      container === "sortingBy" ||
      container === "defaults" ||
      container === "paging" ||
      container === "view"
    ) {
      return "";
    }
    return "dataType";
  }

  // ============ NEW: action.openBoardsFromGraph ============
  if (container === "openBoardsFromGraph") return "actionOpenBoardsFromGraph";

  // ===== прочие секции =====
  if (section === "actions") return "action";
  if (section === "dataRules")
    return container === "rule" ? "dataRuleRule" : "dataRule";
  if (section === "uiRules")
    return container === "rule" ? "uiRuleRule" : "uiRule";
  if (section === "menus") return container === "items" ? "menuItem" : "menu";
  if (section === "medias") return "media";
  if (section === "sequences") return "sequence";
  if (section === "trees") return "tree";
  if (section === "transitiveLinkages") return "transitiveLinkage";
  // ============ NEW: accessRules ============
  if (section === "accessRules") {
    if (
      container === "create" ||
      container === "delete" ||
      container === "edit" ||
      container === "view" ||
      container === "launch"
    ) {
      return "accessRuleItem";
    }
    if (container === "except") return "accessRuleException";
    return "accessRule";
  }
  if (section === "permissions") return "permission";
  if (section === "localizations") return "localization";
  if (section === "mixins") return "mixin";
  if (container === "layout") return "layout";
  if (container === "search") return "transitiveSearch";
  if (container === "by" || container === "defaults") return "sortingByItem";
  return "";
}

export function applyDataTypeMarkers(
  monaco: any,
  model: any,
  index: any,
  currentDomainId: string,
): void {
  try {
    const text = model.getValue();
    const lines = text.split("\n");
    const markers: any[] = [];

    // Кастомные типы домена — для кросс-доменных ссылок можно дополнить
    const customTypes = new Set<string>();
    (index?.dataTypes || []).forEach((dt: any) => {
      if (dt?.id && dt.domainId === currentDomainId) {
        customTypes.add(String(dt.id));
      }
    });

    let inDataTypesSection = false;
    let dashIndent = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Секция верхнего уровня — только indent 0 (без "  - attributes:")
      const sectionM = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (sectionM) {
        inDataTypesSection = sectionM[1] === "dataTypes";
        dashIndent = -1;
        continue;
      }

      if (!inDataTypesSection) continue;

      // Базовый indent "- " для элементов dataTypes[] (запоминаем по первому " - ")
      if (dashIndent === -1) {
        const dashM = line.match(/^(\s*)-\s+\S/);
        if (dashM) dashIndent = dashM[1].length;
      }

      const dtMatch = line.match(
        /^(\s*)(?:-\s+)?dataType\s*:\s*["']?([\w./-]+)["']?\s*(?:#.*)?$/,
      );
      if (!dtMatch) continue;

      const dtIndent = dtMatch[1].length;
      const value = dtMatch[2];
      const valueStartInLine = line.indexOf(value, dtIndent);
      if (valueStartInLine < 0) continue;
      const startCol = valueStartInLine + 1;
      const endCol = startCol + value.length;

      // Верхний уровень элемента dataTypes[]?
      // "  - dataType: Table"  → dtIndent === dashIndent
      // "    dataType: Table"  → dtIndent === dashIndent + 2
      // "        dataType: String" (внутри attributes) → глубже → не top-level
      const isTopLevel =
        dashIndent !== -1 &&
        (dtIndent === dashIndent || dtIndent === dashIndent + 2);

      if (isTopLevel) {
        if (!["Enum", "Table", "Workflow"].includes(value)) {
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            message:
              `Недопустимый тип данных "${value}" в секции dataTypes[]. ` +
              `Ожидается Enum, Table или Workflow.`,
            startLineNumber: i + 1,
            startColumn: startCol,
            endLineNumber: i + 1,
            endColumn: endCol,
            source: "dataType-validator",
          });
        }
        continue;
      }

      // Везде остальное (атрибуты, вложенные item, linkage-атрибуты, таблицы):
      // базовый, кастомный или FQID кастомного типа из другого домена.
      if (value.includes("/")) {
        // FQID — проверить формат, но не резолвить (кросс-домен)
        if (!/^[a-z0-9.-]+\/[\w-]+$/i.test(value)) {
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `Некорректный FQID типа данных "${value}". Ожидается <domain>/<DataTypeId>`,
            startLineNumber: i + 1,
            startColumn: startCol,
            endLineNumber: i + 1,
            endColumn: endCol,
            source: "dataType-validator",
          });
        }
        continue;
      }

      if (!BASE_DATA_TYPES_SET.has(value) && !customTypes.has(value)) {
        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          message:
            `Неизвестный тип данных "${value}". ` +
            (customTypes.size > 0
              ? `Ожидается базовый тип или один из: ` +
                [...customTypes].slice(0, 8).join(", ") +
                (customTypes.size > 8 ? "…" : "")
              : `Ожидается базовый тип.`),
          startLineNumber: i + 1,
          startColumn: startCol,
          endLineNumber: i + 1,
          endColumn: endCol,
          source: "dataType-validator",
        });
      }
    }

    monaco.editor.setModelMarkers(model, "dataType-validator", markers);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[dataType-validator]", err);
  }
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
    // Только entity/linkage/attribute refs.
    // View-поля (view/modal/panel/form/tab/list/page/fromView/addLinksView)
    // валидируются отдельно в applyViewRefMarkers.
    // ВАЖНО: `linkage` здесь НЕ в списке.
    // `linkage:` — это ссылка на связь (FQID `<domain>/<linkageId>`),
    // а не на сущность. Проверяется отдельным блоком ниже.
    const REF_FIELD_PATTERN =
      /^\s*(?:-\s+)?(inherits|entity|side1|side2|attribute|item|source|linkedEntity)\s*:\s*(.+)$/;

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

    // ============ Проверка linkage-ссылок ============
    // Источники: views[].widgets[].linkage, mixins[].linkage, trees[].children[].linkage,
    // transitiveLinkages[].joins[].linkage, actions[].linkage, dataRules[].linkage.
    //
    // Значение — либо `<linkageId>` (текущий домен), либо `<domain>/<linkageId>` (FQID).
    // Резолвим в домене-владельце, а НЕ в домене, где написана строка.
    const knownLinkagesByDomain = new Map<string, Set<string>>();
    const ensureLinkageSet = (domId: string): Set<string> => {
      let set = knownLinkagesByDomain.get(domId);
      if (!set) {
        set = new Set();
        knownLinkagesByDomain.set(domId, set);
      }
      return set;
    };
    (index as any)?.entityLinkages?.forEach((l: any) => {
      if (!l?.domainId || !l?.id) return;
      ensureLinkageSet(String(l.domainId).toLowerCase()).add(
        String(l.id).toLowerCase(),
      );
    });
    if (index?.schemasByDomain) {
      for (const [domId, s] of Object.entries(index.schemasByDomain)) {
        const items = (s as any)?.sections?.linkages?.items || [];
        for (const l of items) {
          if (l?.id) {
            ensureLinkageSet(domId.toLowerCase()).add(
              String(l.id).toLowerCase(),
            );
          }
        }
      }
    }

    // Поддержка и `linkage: x`, и `- linkage: x`.
    const linkageRegex = /^\s*(?:-\s+)?linkage\s*:\s*([^\s#]+)/;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(linkageRegex);
      if (!m) continue;

      const rawLinkageId = m[1].replace(/["']/g, "");
      const slash = rawLinkageId.indexOf("/");
      let idToCheck = rawLinkageId;
      let targetDomain = (currentDomainId || "").toLowerCase();

      if (slash > 0) {
        targetDomain = rawLinkageId.slice(0, slash).toLowerCase();
        idToCheck = rawLinkageId.slice(slash + 1);
      }

      const startCol = line.indexOf(rawLinkageId) + 1;
      const endCol = startCol + rawLinkageId.length;

      // Домен FQID не существует
      if (!domainIds.has(targetDomain)) {
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          message: `Домен «${targetDomain}» не найден в индексе`,
          startLineNumber: i + 1,
          startColumn: startCol,
          endLineNumber: i + 1,
          endColumn: endCol,
          source: "fqid-validator",
        });
        continue;
      }

      // Связь не найдена в целевом домене
      const set = knownLinkagesByDomain.get(targetDomain);
      if (!set || !set.has(idToCheck.toLowerCase())) {
        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          message: `Связь «${idToCheck}» не найдена в домене ${targetDomain}`,
          startLineNumber: i + 1,
          startColumn: startCol,
          endLineNumber: i + 1,
          endColumn: endCol,
          source: "fqid-validator",
        });
      }
    }

    // ============ Проверка ссылок UI Rules ============
    // Собираем все существующие id из текущего YAML (или ModelIndex)
    const knownViews = new Set<string>();
    const knownWidgets = new Set<string>();
    const knownGroups = new Set<string>();
    const knownColumns = new Set<string>();
    const knownPresets = new Set<string>();
    const knownUiRules = new Set<string>();

    if (index?.schemasByDomain) {
      Object.values(index.schemasByDomain).forEach((s: any) => {
        s?.sections?.views?.items?.forEach((v: any) => {
          if (v?.id) knownViews.add(String(v.id).toLowerCase());
        });
        s?.sections?.uiPresets?.items?.forEach((p: any) => {
          if (p?.id) knownPresets.add(String(p.id).toLowerCase());
        });
        s?.sections?.uiRules?.items?.forEach((r: any) => {
          if (r?.id) knownUiRules.add(String(r.id).toLowerCase());
        });
      });
    }
    // Из entity — достаём виджеты, группы (эти id в View'ах)
    (index?.entities || []).forEach(() => {
      // widgets/groups живут в rawData, но их id мы уже видели в lines
    });

    // Парсим текущий текст для получения widget/group/column/preset id
    const widgetDefRegex = /^\s*-\s+id\s*:\s*([^\s#]+)\s*$/;
    let lastSection = "";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const sectionM = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (sectionM) lastSection = sectionM[1];

      const idm = line.match(widgetDefRegex);
      if (idm) {
        const id = idm[1].toLowerCase();
        if (lastSection === "uiPresets") knownPresets.add(id);
        if (lastSection === "views") {
          // внутри views widgets/groups — грубо берём всё
          // Точнее не нужно — id уникален в рамках схемы
          knownWidgets.add(id);
          knownGroups.add(id);
          knownColumns.add(id);
        }
      }
    }

    // Ищем `view:`, `widget:`, `group:`, `column:` в uiRules
    const uiRuleRefs: Array<{
      kind: "view" | "widget" | "group" | "column";
      id: string;
    }> = [];
    let inUiRules = false;
    let uiRuleIndent = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const sectionM = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (sectionM) {
        inUiRules = sectionM[1] === "uiRules";
        continue;
      }
      if (!inUiRules) continue;

      const viewM = line.match(/^\s*view\s*:\s*([^\s#]+)/);
      if (viewM && lastSection === "uiRules") {
        const id = viewM[1].replace(/["']/g, "");
        const startCol = line.indexOf(id) + 1;
        if (!knownViews.has(id.toLowerCase())) {
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `View «${id}» не найден в домене`,
            startLineNumber: i + 1,
            startColumn: startCol,
            endLineNumber: i + 1,
            endColumn: startCol + id.length,
            source: "fqid-validator",
          });
        }
      }

      const widgetM = line.match(/^\s*-\s*widget\s*:\s*([^\s#]+)/);
      if (widgetM) {
        const id = widgetM[1].replace(/["']/g, "");
        const startCol = line.indexOf(id) + 1;
        if (
          !knownWidgets.has(id.toLowerCase()) &&
          !knownViews.has(id.toLowerCase())
        ) {
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `Виджет «${id}» не найден в домене`,
            startLineNumber: i + 1,
            startColumn: startCol,
            endLineNumber: i + 1,
            endColumn: startCol + id.length,
            source: "fqid-validator",
          });
        }
      }

      const groupM = line.match(/^\s*-\s*group\s*:\s*([^\s#]+)/);
      if (groupM) {
        const id = groupM[1].replace(/["']/g, "");
        const startCol = line.indexOf(id) + 1;
        if (!knownGroups.has(id.toLowerCase())) {
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `Группа «${id}» не найдена в домене`,
            startLineNumber: i + 1,
            startColumn: startCol,
            endLineNumber: i + 1,
            endColumn: startCol + id.length,
            source: "fqid-validator",
          });
        }
      }

      const columnM = line.match(/^\s*-\s*column\s*:\s*([^\s#]+)/);
      if (columnM) {
        const id = columnM[1].replace(/["']/g, "");
        const startCol = line.indexOf(id) + 1;
        if (!knownColumns.has(id.toLowerCase())) {
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `Колонка «${id}» не найдена в домене`,
            startLineNumber: i + 1,
            startColumn: startCol,
            endLineNumber: i + 1,
            endColumn: startCol + id.length,
            source: "fqid-validator",
          });
        }
      }

      const presetM = line.match(/^\s*-\s*preset\s*:\s*([^\s#]+)/);
      if (presetM) {
        const id = presetM[1].replace(/["']/g, "");
        const startCol = line.indexOf(id) + 1;
        if (!knownPresets.has(id.toLowerCase())) {
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `Пресет «${id}» не найден в домене`,
            startLineNumber: i + 1,
            startColumn: startCol,
            endLineNumber: i + 1,
            endColumn: startCol + id.length,
            source: "fqid-validator",
          });
        }
      }
    }

    // ============ Валидация actions ============

    let inActionsSection = false;
    let actionEntity: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const sectionM = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (sectionM) {
        inActionsSection = sectionM[1] === "actions";
        actionEntity = null;
        continue;
      }
      if (!inActionsSection) continue;

      // Текущий action entity
      const idm = line.match(/^\s*-\s+id\s*:/);
      if (idm) {
        actionEntity = null;
      }
      const entityM = line.match(/^\s*entity\s*:\s*([^\s#]+)/);
      if (entityM) {
        actionEntity = entityM[1].replace(/["']/g, "");
      }

      // automation.id — должен быть UUID
      const automationIdM = line.match(/^\s*id\s*:\s*([^\s#]+)/);
      if (automationIdM) {
        // Проверяем только внутри automation блока
        let insideAutomation = false;
        for (let j = i - 1; j >= 1; j--) {
          const pl = model.getLineContent(j);
          if (/^\s*automation\s*:/.test(pl)) {
            insideAutomation = true;
            break;
          }
          if (/^\s*-\s*id\s*:/.test(pl)) break;
          if (
            /^\s*[a-zA-Z_]\w*\s*:/.test(pl) &&
            !/^\s*(automation|name|description)\s*:/.test(pl)
          )
            break;
        }
        if (insideAutomation) {
          const uuid = automationIdM[1].replace(/["']/g, "");
          if (
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              uuid,
            )
          ) {
            const startCol = line.indexOf(uuid) + 1;
            markers.push({
              severity: monaco.MarkerSeverity.Warning,
              message: `Ожидается UUID автоматизации (вида xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)`,
              startLineNumber: i + 1,
              startColumn: startCol,
              endLineNumber: i + 1,
              endColumn: startCol + uuid.length,
              source: "fqid-validator",
            });
          }
        }
      }

      // values[].attribute — существующий атрибут сущности действия?
      const valueAttrM = line.match(/^\s*-\s+attribute\s*:\s*([^\s#]+)/);
      if (valueAttrM && actionEntity && index) {
        const attrId = valueAttrM[1].replace(/["']/g, "");
        const domainPrefix = (currentDomainId || "").toLowerCase() + "/";
        let entityFqid = actionEntity.includes("/")
          ? actionEntity.toLowerCase()
          : (domainPrefix + actionEntity).toLowerCase();
        const entity = index.entitiesByFqid?.[entityFqid];
        if (entity) {
          const known = entity.attributes.some(
            (a: any) => a.id.toLowerCase() === attrId.toLowerCase(),
          );
          if (!known) {
            const startCol = line.indexOf(attrId) + 1;
            markers.push({
              severity: monaco.MarkerSeverity.Warning,
              message: `Атрибут «${attrId}» не найден в сущности ${actionEntity}`,
              startLineNumber: i + 1,
              startColumn: startCol,
              endLineNumber: i + 1,
              endColumn: startCol + attrId.length,
              source: "fqid-validator",
            });
          }
        }
      }

      // operation: должен соответствовать type
      const opM = line.match(/^\s*operation\s*:\s*([^\s#]+)/);
      if (opM) {
        const opValue = opM[1].replace(/["']/g, "");

        let idLine = -1;
        let idIndent = -1;
        for (let j = i - 1; j >= 0; j--) {
          const l = lines[j];
          if (!l.trim() || l.trim().startsWith("#")) continue;
          const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
          if (lInd === 0) break;
          const idm = l.match(/^(\s*)-\s+id\s*:/);
          if (idm) {
            idLine = j;
            idIndent = idm[1].length;
            break;
          }
        }
        if (idLine === -1) continue;

        let typeVal: string | null = null;
        for (let j = idLine + 1; j < i; j++) {
          const l = lines[j];
          const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
          if (lInd <= idIndent) break;
          const tm = l.match(/^\s*type\s*:\s*([^\s#]+)/);
          if (tm) {
            typeVal = tm[1].replace(/["']/g, "");
            break;
          }
        }
        if (!typeVal) continue;

        const opsByType: Record<string, string[]> = {
          open_modal: ["create", "edit"],
          open_page: ["create", "edit", "view"],
          bulk: ["remove", "edit", "edit_attribute"],
        };
        const allowed = opsByType[typeVal] || [];

        if (allowed.length > 0 && !allowed.includes(opValue)) {
          const startCol = line.indexOf(opValue) + 1;
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `Недопустимое operation для type: ${typeVal}. Ожидается: ${allowed.join(" | ")}`,
            startLineNumber: i + 1,
            startColumn: startCol,
            endLineNumber: i + 1,
            endColumn: startCol + opValue.length,
            source: "fqid-validator",
          });
        }
      }
    }

    // ============ Валидация list-view ============
    {
      // Извлекаем все id колонок внутри views.table.columns
      const columnIds = new Set<string>();
      const sortingIds = new Set<string>();
      const actionIds = new Set<string>();
      const viewIds = new Set<string>();

      // Из текущего YAML
      let inViews = false;
      let inColumns = false;
      let inSortingBy = false;
      let inActions = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const sectionM = line.match(/^([a-zA-Z_][\w]*)\s*:/);
        if (sectionM) {
          inViews = sectionM[1] === "views";
          inColumns = false;
          inSortingBy = false;
          inActions = false;
          continue;
        }
        if (!inViews) continue;

        if (/^\s*columns\s*:\s*$/.test(line)) inColumns = true;
        else if (/^\s*sortingBy\s*:\s*$/.test(line)) inSortingBy = true;
        else if (/^\s*actions\s*:\s*$/.test(line)) inActions = true;
        else if (
          /^\s*[a-zA-Z_]\w*\s*:\s*$/.test(line) &&
          !/^\s*(filter|paging|refresh|empty)\s*:/.test(line)
        ) {
          // Другой контейнер — закрываем предыдущий
        }

        const idM = line.match(/^\s*-\s+id\s*:\s*([^\s#]+)/);
        if (idM) {
          const id = idM[1].replace(/["']/g, "").toLowerCase();
          viewIds.add(id);
          if (inColumns) columnIds.add(id);
        }
        const sortingM = line.match(/^\s*-\s+id\s*:\s*([^\s#]+)/);
      }

      // Из ModelIndex (sorting IDs)
      if (index?.entities) {
        // sorting идёт из entities[].sorting[].id, но сейчас не собираем — пропускаем
      }

      // Проверяем ссылки column: / sorting: / action: / widget: в views
      let currentSortingSection = false;
      inViews = false;
      inSortingBy = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const sectionM = line.match(/^([a-zA-Z_][\w]*)\s*:/);
        if (sectionM) {
          inViews = sectionM[1] === "views";
          inSortingBy = false;
          continue;
        }
        if (!inViews) continue;

        if (/^\s*sortingBy\s*:\s*$/.test(line)) inSortingBy = true;

        // column: <colId> внутри sortingBy
        const colM = line.match(/^\s*column\s*:\s*([^\s#]+)/);
        if (colM && inSortingBy) {
          const id = colM[1].replace(/["']/g, "");
          if (!columnIds.has(id.toLowerCase())) {
            const startCol = line.indexOf(id) + 1;
            markers.push({
              severity: monaco.MarkerSeverity.Warning,
              message: `Столбец «${id}» не найден среди columns[].id`,
              startLineNumber: i + 1,
              startColumn: startCol,
              endLineNumber: i + 1,
              endColumn: startCol + id.length,
              source: "fqid-validator",
            });
          }
        }

        // sorting: <sortingId>
        const sortM = line.match(/^\s*sorting\s*:\s*([^\s#]+)/);
        if (sortM) {
          const id = sortM[1].replace(/["']/g, "");
          const startCol = line.indexOf(id) + 1;
          // sortingID должен быть в entities[].sorting[].id — пропускаем без проверки
          // (это вне views, лень тащить)
        }
      }
    }

    // ============ Валидация mixins ============
    let inMixins = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const sectionM = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (sectionM) {
        inMixins = sectionM[1] === "mixins";
        continue;
      }
      if (!inMixins) continue;

      // linkage: <ref> — должен быть в известных linkage
      const linkageM = line.match(/^\s*linkage\s*:\s*([^\s#]+)/);
      if (linkageM) {
        const id = linkageM[1].replace(/["']/g, "");
        const knownLinkageIds = new Set<string>();
        (index as any)?.entityLinkages?.forEach((l: any) => {
          knownLinkageIds.add(String(l.id).toLowerCase());
        });
        if (index?.schemasByDomain) {
          Object.values(index.schemasByDomain).forEach((s: any) => {
            s?.sections?.linkages?.items?.forEach((l: any) => {
              if (l?.id) knownLinkageIds.add(String(l.id).toLowerCase());
            });
          });
        }
        if (!knownLinkageIds.has(id.toLowerCase())) {
          const startCol = line.indexOf(id) + 1;
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `Связь «${id}» не найдена в домене`,
            startLineNumber: i + 1,
            startColumn: startCol,
            endLineNumber: i + 1,
            endColumn: startCol + id.length,
            source: "fqid-validator",
          });
        }
      }

      // fromView: <viewId> — должен быть в views
      const fromViewM = line.match(/^\s*fromView\s*:\s*([^\s#]+)/);
      if (fromViewM) {
        const id = fromViewM[1].replace(/["']/g, "");
        const knownViews = new Set<string>();
        if (index?.schemasByDomain) {
          Object.values(index.schemasByDomain).forEach((s: any) => {
            s?.sections?.views?.items?.forEach((v: any) => {
              if (v?.id) knownViews.add(String(v.id).toLowerCase());
            });
          });
        }
        // Также из текущего YAML
        let currentViewsSection = false;
        for (let j = 0; j < lines.length; j++) {
          const l = lines[j];
          const sm = l.match(/^([a-zA-Z_][\w]*)\s*:/);
          if (sm) {
            currentViewsSection = sm[1] === "views";
            continue;
          }
          if (!currentViewsSection) continue;
          const idm = l.match(/^\s*-\s+id\s*:\s*([^\s#]+)/);
          if (idm) knownViews.add(idm[1].replace(/["']/g, "").toLowerCase());
        }
        if (!knownViews.has(id.toLowerCase())) {
          const startCol = line.indexOf(id) + 1;
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `View «${id}» не найден в домене`,
            startLineNumber: i + 1,
            startColumn: startCol,
            endLineNumber: i + 1,
            endColumn: startCol + id.length,
            source: "fqid-validator",
          });
        }
      }
    }

    // ============ Валидация сценариев (actions) ============
    {
      let inActions = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const sectionM = line.match(/^([a-zA-Z_][\w]*)\s*:/);
        if (sectionM) {
          inActions = sectionM[1] === "actions";
          continue;
        }
        if (!inActions) continue;

        // Внутри одного action собираем type и scenario
        const idM = line.match(/^\s*-\s+id\s*:/);
        if (idM) {
          // Новый экшен — ищем пару type/scenario в блоке до следующего - id:
          let actionType: string | null = null;
          let scenarioLine: number = -1;
          let scenarioValue: string | null = null;
          let typeLine: number = -1;

          for (let j = i + 1; j < lines.length; j++) {
            const l = lines[j];
            if (!l.trim() || l.trim().startsWith("#")) continue;
            const lInd = (l.match(/^(\s*)/) || ["", ""])[1].length;
            if (/^\s*-\s+id\s*:/.test(l) && lInd <= 2) break;
            if (lInd === 0) break;

            const tm = l.match(/^\s*type\s*:\s*([^\s#]+)/);
            if (tm && actionType === null) {
              actionType = tm[1].replace(/["']/g, "");
              typeLine = j;
            }
            const sm = l.match(/^\s*scenario\s*:\s*([^\s#]+)/);
            if (sm && scenarioValue === null) {
              scenarioValue = sm[1].replace(/["']/g, "");
              scenarioLine = j;
            }
          }

          if (actionType === "scenario" && !scenarioValue && typeLine >= 0) {
            const tLine = lines[typeLine];
            const startCol =
              tLine.indexOf("scenario") !== -1
                ? tLine.indexOf("scenario") + 1
                : 1;
            markers.push({
              severity: monaco.MarkerSeverity.Error,
              message: `Для type: scenario обязательно поле scenario: <id>`,
              startLineNumber: typeLine + 1,
              startColumn: Math.max(1, startCol),
              endLineNumber: typeLine + 1,
              endColumn: tLine.length + 1,
              source: "fqid-validator",
            });
          }

          if (
            actionType &&
            actionType !== "scenario" &&
            scenarioValue &&
            scenarioLine >= 0
          ) {
            const sLine = lines[scenarioLine];
            const startCol = sLine.indexOf(scenarioValue) + 1;
            markers.push({
              severity: monaco.MarkerSeverity.Warning,
              message: `Поле scenario не имеет смысла при type: ${actionType} (ожидается type: scenario)`,
              startLineNumber: scenarioLine + 1,
              startColumn: startCol,
              endLineNumber: scenarioLine + 1,
              endColumn: startCol + scenarioValue.length,
              source: "fqid-validator",
            });
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

/**
 * Валидатор view-ссылок (view, modal, panel, form, tab, list, page,
 * fromView, addLinksView). В отличие от applyFqidMarkers, проверяет
 * по набору view-id текущего домена, а FQID на чужие домены пропускает.
 * Корректно работает с view-id, содержащими точку (lists.documents).
 */
export function applyViewRefMarkers(
  monaco: any,
  model: any,
  index: any,
  currentDomainId: string,
): void {
  try {
    const text = model.getValue();
    const lines = text.split("\n");
    const markers: any[] = [];

    const localDomain = (currentDomainId || "").toLowerCase();
    const schema = index?.schemasByDomain?.[currentDomainId];

    // ============ localViewIds: top-level views + nested views ============
    const localViewIds = new Set<string>();
    if (Array.isArray(schema?.allViews)) {
      for (const v of schema.allViews) {
        if (v?.id) localViewIds.add(String(v.id).toLowerCase());
      }
    }
    if (schema?.sections?.views?.items) {
      for (const v of schema.sections.views.items) {
        if (v?.id) localViewIds.add(String(v.id).toLowerCase());
      }
    }
    const els = index?.viewElementsByDomain?.[currentDomainId];
    if (els && typeof els === "object") {
      for (const vId of Object.keys(els)) localViewIds.add(vId.toLowerCase());
    }

    // ============ localGroupIds: все группы из всех top-level views ============
    // viewElementsByDomain[v].groups содержит группы всех уровней вложенности
    // (collectFromView рекурсирует по view.views и пишет в тот же набор).
    const localGroupIds = new Set<string>();
    if (els && typeof els === "object") {
      for (const view of Object.values(els) as Array<any>) {
        if (Array.isArray(view?.groups)) {
          for (const gid of view.groups)
            localGroupIds.add(String(gid).toLowerCase());
        }
        if (Array.isArray(view?.groupsWithType)) {
          for (const g of view.groupsWithType) {
            if (g?.id) localGroupIds.add(String(g.id).toLowerCase());
          }
        }
      }
    }

    // ============ Поля view-уровня и group-уровня ============
    const VIEW_REF_PATTERN =
      /^\s*(?:-\s+)?(view|modal|panel|list|fromView|addLinksView)\s*:\s*(.+)$/;
    const GROUP_REF_PATTERN = /^\s*(?:-\s+)?(tab|form|block)\s*:\s*(.+)$/;

    const checkRef = (
      i: number,
      line: string,
      rawValue: string,
      pool: Set<string>,
      kind: "view" | "group",
    ): void => {
      let value = rawValue.split(" #")[0].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!value) return;
      if (value.startsWith("external:")) return;

      const slashIdx = value.indexOf("/");
      let domain: string | null = null;
      let localId = value;
      if (slashIdx > 0) {
        domain = value.slice(0, slashIdx).toLowerCase();
        localId = value.slice(slashIdx + 1);
      }
      if (domain && domain !== localDomain) return; // чужой домен — не наша зона

      if (!pool.has(localId.toLowerCase())) {
        const startCol = line.indexOf(value) + 1;
        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          message:
            kind === "view"
              ? `View «${localId}» не найден в домене ${currentDomainId}`
              : `Group «${localId}» не найдена в домене ${currentDomainId}`,
          startLineNumber: i + 1,
          startColumn: startCol,
          endLineNumber: i + 1,
          endColumn: startCol + value.length,
          source: "view-ref-validator",
        });
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const vm = line.match(VIEW_REF_PATTERN);
      if (vm) {
        const fieldName = vm[1];
        // В `mixins[].views[].to.*` поле `panel` / `list` резолвится в домене
        // целевой сущности (`entity.to` для linkage, `entity` для view),
        // который может быть ДРУГИМ доменом. Без полного контекста миксина
        // Monaco не может корректно проверить — оставляем это линтеру.
        const lineCtx = ctx.lineMap?.lineContexts.get(i + 1);
        const inMixins = lineCtx?.section === "mixins";
        if (inMixins && (fieldName === "panel" || fieldName === "list")) {
          continue;
        }
        checkRef(i, line, vm[2], localViewIds, "view");
        continue;
      }
      const gm = line.match(GROUP_REF_PATTERN);
      if (gm) {
        checkRef(i, line, gm[2], localGroupIds, "group");
      }
    }

    monaco.editor.setModelMarkers(model, "view-ref-validator", markers);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[view-ref-validator]", err);
  }
}

// ============ Attribute-markers: уникальность id + системные имена ============

const SYSTEM_ATTRIBUTE_IDS = new Set<string>([
  "id",
  "label",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "organizationId",
  "tenantId",
  "domainId",
  "entityId",
  "entityName",
  "version",
]);

export function applyAttributeMarkers(monaco: any, model: any): void {
  try {
    const lines = model.getValue().split("\n");
    const markers: any[] = [];

    // ============ Проходим только секцию entities ============
    let section = "";
    let sectionStart = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const sectionM = line.match(/^([a-zA-Z_][\w]*)\s*:/);
      if (sectionM) {
        section = sectionM[1];
        sectionStart = i;
        if (section !== "entities") continue;
        // Нашли entities — идём до конца или до следующей секции
        let j = i + 1;
        while (j < lines.length) {
          if (/^[a-zA-Z_][\w]*\s*:/.test(lines[j])) break;
          j++;
        }
        scanEntities(lines, i + 1, j, markers, monaco);
        i = j - 1;
      }
    }

    monaco.editor.setModelMarkers(model, "attribute-validator", markers);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[attribute-validator]", err);
  }
}

function scanEntities(
  lines: string[],
  startIdx: number,
  endIdx: number,
  markers: any[],
  monaco: any,
): void {
  // ============ 1. Определяем indent "- " верхнего уровня (сущностей) ============
  let entityDashIndent = -1;
  for (let i = startIdx; i < endIdx; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const dashM = line.match(/^(\s*)-\s+\S/);
    if (!dashM) continue;
    const indent = dashM[1].length;
    if (entityDashIndent === -1 || indent < entityDashIndent) {
      entityDashIndent = indent;
    }
  }
  if (entityDashIndent === -1) return;

  // Поля сущности идут либо как "- id: X" на entityDashIndent,
  // либо как "id: X" на entityDashIndent + 2.
  const fieldIndent = entityDashIndent + 2;

  interface EntityBlock {
    id: string;
    idLine: number;
    attrIdList: Array<{ id: string; idLine: number; idIndent: number }>;
  }
  const entityBlocks: EntityBlock[] = [];

  let i = startIdx;
  while (i < endIdx) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) {
      i++;
      continue;
    }

    const dashM = line.match(/^(\s*)-\s+\S/);
    if (!dashM || dashM[1].length !== entityDashIndent) {
      i++;
      continue;
    }

    // Границы сущности — до следующего "- " с тем же indent
    let entityEnd = endIdx;
    for (let k = i + 1; k < endIdx; k++) {
      const l = lines[k];
      if (!l.trim() || l.trim().startsWith("#")) continue;
      const d = l.match(/^(\s*)-\s+\S/);
      if (d && d[1].length === entityDashIndent) {
        entityEnd = k;
        break;
      }
    }

    // id сущности: "- id: X" на entityDashIndent или "id: X" на fieldIndent
    let entityId: string | null = null;
    let entityIdLine = -1;
    for (let k = i; k < entityEnd; k++) {
      const l = lines[k];
      if (!l.trim() || l.trim().startsWith("#")) continue;

      const dashIdM = l.match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
      if (dashIdM && dashIdM[1].length === entityDashIndent) {
        entityId = dashIdM[2].replace(/["']/g, "");
        entityIdLine = k + 1;
        break;
      }
      const idM = l.match(/^(\s*)id\s*:\s*([^\s#]+)/);
      if (idM && idM[1].length === fieldIndent) {
        entityId = idM[2].replace(/["']/g, "");
        entityIdLine = k + 1;
        break;
      }
    }
    if (!entityId) {
      i = entityEnd;
      continue;
    }

    // attributes: на fieldIndent (или "- attributes:" на entityDashIndent)
    let attributesLine = -1;
    let attributesEnd = entityEnd;
    for (let k = i + 1; k < entityEnd; k++) {
      const l = lines[k];
      const am = l.match(/^(\s*)(-\s+)?attributes\s*:\s*$/);
      if (!am) continue;
      const beforeIndent = am[1].length;
      const hasDash = !!am[2];
      const ok = hasDash
        ? beforeIndent === entityDashIndent
        : beforeIndent === fieldIndent;
      if (!ok) continue;
      attributesLine = k;
      for (let n = k + 1; n < entityEnd; n++) {
        const nl = lines[n];
        if (!nl.trim()) continue;
        const nIndent = (nl.match(/^(\s*)/) || ["", ""])[1].length;
        if (nIndent <= fieldIndent) {
          attributesEnd = n;
          break;
        }
      }
      break;
    }

    // Собираем "- " элементы внутри attributes[]
    const attrIdList: Array<{ id: string; idLine: number; idIndent: number }> =
      [];
    if (attributesLine >= 0) {
      let attrDashIndent = -1;
      for (let k = attributesLine + 1; k < attributesEnd; k++) {
        const l = lines[k];
        if (!l.trim() || l.trim().startsWith("#")) continue;
        const d = l.match(/^(\s*)-\s+\S/);
        if (d) {
          attrDashIndent = d[1].length;
          break;
        }
      }

      if (attrDashIndent > fieldIndent) {
        const attrFieldIndent = attrDashIndent + 2;
        for (let k = attributesLine + 1; k < attributesEnd; k++) {
          const l = lines[k];
          if (!l.trim() || l.trim().startsWith("#")) continue;
          const d = l.match(/^(\s*)-\s+\S/);
          if (!d || d[1].length !== attrDashIndent) continue;

          // Границы атрибута — до следующего "- " на attrDashIndent
          let attrEnd = attributesEnd;
          for (let n = k + 1; n < attributesEnd; n++) {
            const nl = lines[n];
            if (!nl.trim() || nl.trim().startsWith("#")) continue;
            const nd = nl.match(/^(\s*)-\s+\S/);
            if (nd && nd[1].length === attrDashIndent) {
              attrEnd = n;
              break;
            }
          }

          // id: "- id: X" на attrDashIndent или "id: X" на attrFieldIndent
          let attrId: string | null = null;
          let attrIdLine = -1;
          for (let n = k; n < attrEnd; n++) {
            const nl = lines[n];
            const dashIdM = nl.match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
            if (dashIdM && dashIdM[1].length === attrDashIndent) {
              attrId = dashIdM[2].replace(/["']/g, "");
              attrIdLine = n + 1;
              break;
            }
            const idM = nl.match(/^(\s*)id\s*:\s*([^\s#]+)/);
            if (idM && idM[1].length === attrFieldIndent) {
              attrId = idM[2].replace(/["']/g, "");
              attrIdLine = n + 1;
              break;
            }
          }
          if (attrId) {
            attrIdList.push({
              id: attrId,
              idLine: attrIdLine,
              idIndent: attrDashIndent,
            });
          }
          k = attrEnd - 1;
        }
      }
    }

    entityBlocks.push({ id: entityId, idLine: entityIdLine, attrIdList });
    i = entityEnd;
  }

  // ============ 2.0. Уникальность entity.id в домене ============
  const seenEntities = new Map<string, number[]>();
  for (const eb of entityBlocks) {
    if (!seenEntities.has(eb.id)) seenEntities.set(eb.id, []);
    seenEntities.get(eb.id)!.push(eb.idLine);
  }
  for (const [entityId, idLines] of seenEntities) {
    if (idLines.length < 2) continue;
    for (const line of idLines) {
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: `Дубликат entity.id «${entityId}» в домене (строки ${idLines.join(", ")})`,
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: 1_000_000,
        source: "attribute-validator",
      });
    }
  }

  // ============ 2.1. Уникальность attribute.id ВНУТРИ сущности ============
  for (const eb of entityBlocks) {
    const seen = new Map<string, number[]>();
    for (const a of eb.attrIdList) {
      if (!seen.has(a.id)) seen.set(a.id, []);
      seen.get(a.id)!.push(a.idLine);
    }
    for (const [attrId, idLines] of seen) {
      if (idLines.length < 2) continue;
      for (const line of idLines) {
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          message: `Дубликат attribute.id «${attrId}» в сущности «${eb.id}» (строки ${idLines.join(", ")})`,
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: 1_000_000,
          source: "attribute-validator",
        });
      }
    }

    // ============ 2.2. Системные имена ============
    for (const a of eb.attrIdList) {
      if (!SYSTEM_ATTRIBUTE_IDS.has(a.id)) continue;
      const line = lines[a.idLine - 1];
      const startCol = line.indexOf(a.id) + 1;
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: `Идентификатор «${a.id}» зарезервирован системным атрибутом. Выберите другое имя.`,
        startLineNumber: a.idLine,
        startColumn: startCol > 0 ? startCol : 1,
        endLineNumber: a.idLine,
        endColumn: startCol > 0 ? startCol + a.id.length : 1_000_000,
        source: "attribute-validator",
      });
    }
  }
}

/**
 * Находит значение `type:` в записи виджета, к которому относится `control:`.
 * Работает независимо от порядка полей виджета — `control:` может быть
 * первым (`- control:`), может стоять после `- id:`/`- entity:`, а `type:`
 * может быть как до, так и после `control:`.
 *
 * Не путает `type:` самого виджета с `type:` внутри `control:` или внутри
 * других вложенных контейнеров (buttons, footer, columns, …) — ищет строго
 * на уровне полей виджета (`widgetItemIndent + 2`).
 */
function findWidgetTypeForControl(
    lines: string[],
    controlLine: number, // 1-based
): string {
    if (controlLine < 1 || controlLine > lines.length) return "";
    const controlText = lines[controlLine - 1];
    if (!controlText) return "";

    const controlIndent = (controlText.match(/^(\s*)/) || ["", ""])[1].length;

    // `- control:` — открывает виджет; `  control:` — обычное поле виджета.
    const isControlOpener =
        /^\s*-\s+control\s*:\s*(?:#.*)?$/.test(controlText);

    // Индент dash'а виджета.
    const widgetItemIndent = isControlOpener
        ? controlIndent
        : controlIndent - 2;
    if (widgetItemIndent < 0) return "";
    const widgetFieldIndent = widgetItemIndent + 2;

    // ============ Границы виджет-блока ============
    let blockStart = controlLine;
    if (!isControlOpener) {
        for (let i = controlLine - 1; i >= 1; i--) {
            const l = lines[i - 1];
            if (!l || !l.trim() || l.trim().startsWith("#")) continue;
            const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;
            const m = l.match(/^(\s*)-\s+\S/);
            if (m && m[1].length === widgetItemIndent) {
                blockStart = i;
                break;
            }
            if (ind < widgetItemIndent) break;
        }
    }

    let blockEnd = lines.length + 1;
    for (let i = blockStart + 1; i <= lines.length; i++) {
        const l = lines[i - 1];
        if (!l || !l.trim()) continue;
        const m = l.match(/^(\s*)-\s+\S/);
        if (m && m[1].length <= widgetItemIndent) {
            blockEnd = i;
            break;
        }
    }

    // ============ Поиск `type:` на уровне полей виджета ============
    let blockScalarIndent = -1;
    for (let i = blockStart; i < blockEnd; i++) {
        const l = lines[i - 1];
        if (!l || !l.trim()) continue;
        const ind = (l.match(/^(\s*)/) || ["", ""])[1].length;

        // Пропускаем содержимое block scalar.
        if (blockScalarIndent >= 0) {
            if (ind > blockScalarIndent) continue;
            blockScalarIndent = -1;
        }
        if (l.trim().startsWith("#")) continue;

        // Начало block scalar (`label: |`, `description: >-` и т.п.).
        if (/^\s*(?:-\s+)?[a-zA-Z_][\w]*\s*:\s*[|>][+\-]?\s*(?:#.*)?$/.test(l)) {
            blockScalarIndent = ind;
            continue;
        }

        // Поля самого виджета — только этот уровень.
        if (ind !== widgetFieldIndent) continue;

        const tm = l.match(/^\s*type\s*:\s*["']?([\w.-]+)["']?/);
        if (tm) return tm[1];
    }

    return "";
}