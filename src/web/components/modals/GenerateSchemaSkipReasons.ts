// src/web/components/modals/GenerateSchemaSkipReasons.ts
const REASON_LABELS: Record<string, string> = {
  "already-exists": "Уже есть в YAML",
  dictionary: "Сущность-справочник — UI не генерируется",
  "no-list-ui": "ui.list: false — списочное представление не нужно",
  "no-menu-root": "Нет root_group в menus[] — некуда добавлять пункт меню",
  "technical-no-ui": "Техническая сущность — UI не требуется",
  "no-linkages-side1": "Нет исходящих связей (side-1) для построения дерева",
  "splitted-needs-list": "Для splitted-варианта нужен list-view",
};

export function humanizeSkipReason(reason: string): string {
  return REASON_LABELS[reason] || reason;
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
