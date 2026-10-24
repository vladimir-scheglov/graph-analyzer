/**
 * Единый источник истины для action-типов.
 * Используется в:
 *   - core/analyzer/linter.ts (checkActions)
 *   - core/analyzer/local-recheck.ts (action/unknown-type)
 *   - web/lib/monaco/monaco-providers.ts (autocomplete + descriptions)
 *   - web/components/modals/YamlViewerModal.tsx (KNOWN_ACTION_TYPES_UI)
 *
 * При добавлении нового типа — обновить в одном месте.
 */

export const ACTION_TYPES = [
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
  "workflow",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export const KNOWN_ACTION_TYPES = new Set<string>(ACTION_TYPES);

export const ACTION_OPERATIONS_BY_TYPE: Record<string, Set<string>> = {
  open_modal: new Set(["create", "edit"]),
  open_page: new Set(["create", "edit", "view"]),
  bulk: new Set(["remove", "edit", "edit_attribute", "import", "export"]),
  tree_bulk: new Set(["edit", "remove"]),
};

export const ACTION_TYPE_DESCRIPTIONS: Record<string, string> = {
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
