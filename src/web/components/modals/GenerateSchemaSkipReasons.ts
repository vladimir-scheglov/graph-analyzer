// src/web/components/modals/GenerateSchemaSkipReasons.ts
const REASON_LABELS: Record<string, string> = {
  "already-exists": "Уже есть в YAML",
  dictionary: "Сущность-справочник — UI не генерируется",
  "no-list-ui": "ui.list: false — списочное представление не нужно",
  "no-menu-root": "Нет root_group в menus[] — некуда добавлять пункт меню",
  "technical-no-ui": "Техническая сущность — UI не требуется",
  "no-linkages-side1": "Нет исходящих связей (side-1) для построения дерева",
  "splitted-needs-list": "Для splitted-варианта нужен list-view",
  "id-conflict": "В YAML уже есть view для этой сущности под другим id",
  "no-chain": "Цепочка не построена",
  "no-entity-view": "Нет entity-view для этой сущности",
  "no-list-view": "Нет list-view для этой сущности",
  "no-tab-views": "Не выбрано ни одного list-view",
  "nothing-to-generate": "Нечего генерировать (опции выключены)",
  "no-suitable-attributes": "Нет атрибутов подходящего типа",
  "no-tree-chain": "Цепочка дерева пуста",
  "widget-view-ambiguous": "Несколько entity-view — нужен выбор",
  "widget-view-wrong-type": "Выбранный view — не entity-view",
  "widget-view-wrong-entity": "Выбранный view — другая сущность",
  "column-view-ambiguous": "Несколько list/tree-view — нужен выбор",
  "column-view-wrong-type": "Выбранный view — не list/tree",
  "column-view-wrong-entity": "Выбранный view — другая сущность",
};

const REASON_HINTS: Record<string, string> = {
  "no-entity-view":
    "Сгенерируйте entity-view (профиль CRUD или Справочник) — виджет добавится при повторной генерации",
  "no-list-view":
    "Сгенерируйте list-view (профиль CRUD) — колонка добавится при повторной генерации",
  "no-chain": "Постройте цепочку связей в разделе «Цепочка транзитивной связи»",
  "no-tab-views":
    "Выберите хотя бы один list-view в разделе «Параметры tabs-list»",
  "nothing-to-generate":
    "Включите хотя бы sorting или searching в параметрах профиля",
  "no-suitable-attributes":
    "У сущности нет атрибутов, для которых применимо правило",
  "no-menu-root":
    "Создайте root_group в menus[] — тогда генератор сможет добавить пункт меню",
  "id-conflict":
    "Переименуйте существующий view или удалите его — генератор не создаёт дубликаты",
  "splitted-needs-list":
    "Сгенерируйте list-view (профиль CRUD) — без него splitted-вариант невозможен",
};

export function humanizeSkipReason(reason: string): string {
  return REASON_LABELS[reason] || reason;
}

/**
 * Возвращает человеко-читаемый hint для skipped-записи.
 * Приоритет: hint из builder'а > словарь REASON_HINTS по reason > null.
 */
export function getSkipReasonHint(
  reason: string,
  entryHint?: string,
): string | null {
  if (entryHint) return entryHint;
  return REASON_HINTS[reason] || null;
}

/** Иконка по причине — для визуального различения. */
export function skipReasonIcon(reason: string): string {
  switch (reason) {
    case "already-exists":
      return "check";
    case "dictionary":
    case "technical-no-ui":
      return "inventory_2";
    case "no-list-ui":
    case "no-menu-root":
      return "block";
    case "no-linkages-side1":
      return "link_off";
    case "splitted-needs-list":
      return "warning";
    default:
      return "info";
  }
}
