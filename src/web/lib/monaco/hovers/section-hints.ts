export const SECTION_HINTS: Record<string, string> = {
  entities:
    "**entities** — Сущности домена. Ключевые поля: `id` (PascalCase, ≤30), `attributes`, `label`, `description`.\n\nСистемные атрибуты (`id`, `createdAt`, `createdBy`, `label`, `organizationId`, `domainId`, `entityId`, `version`, `updatedAt`, `updatedBy`, `tenantId`) добавляются автоматически — не объявляйте их.",
  linkages:
    "**linkages** — Связи между сущностями. `type`: `1_1`, `1_n`, `n_n`. Поле `undirected: true` — только для `n_n`. `nameFrom` — глагольные формы сторон.",
  dataTypes:
    "**dataTypes** — Пользовательские типы: `Enum`, `Workflow`, `Table`. Ссылаются через `dataType:` атрибута или `entities[].attributes[].dataType`.",
  views:
    "**views** — Представления: `entity`, `list`, `tabs_list`, `dashboard`, `tree`, `dashboard_tree`.\n\nНе путать с `views[].views[]` (panel/modal/page) и `views[].widgets[]`.",
  actions:
    "**actions** — Набор обязательных полей зависит от `type`:\n- `open_modal` → `modal` + `entity` + `operation`\n- `open_panel` → `panel` + `entity`\n- `open_page` → `view` + `entity` + `operation`\n- `bulk` → `entity` + `operation`\n- `automation` → `automation.id` (UUID)\n- `scenario` → `scenario` + `workerTag`",
  menus:
    "**menus** — `root_group` (раздел с `items[]`) или `root_menu` (отдельный пункт). `route` уникален. `placement`: `top` (главное меню) или `settings`.",
  dataRules:
    "**dataRules** — Правила данных. `condition`: `true` или `!rql …`. `readonly: true` атрибута нельзя ослабить правилом.",
  mixins:
    "**mixins** — `type: view` (только интерфейс) или `type: linkage` (данные + интерфейс через `1_1`/`1_n`). `weight` — меньше = выше приоритет.",
  sequences:
    "**sequences** — Несегментированные идентификаторы. `startFrom` по умолчанию 1. Ссылаться через `attributes[].sequence`.",
  counterColorPattern:
    "**counterColorPattern** — Цветовые схемы счётчиков. `red` > `yellow`. Форматы: `1w2d3h5m` (время) или `60%` — в рамках правила формат единый.",
  trees:
    "**trees** — Деревья связей. `type`: `ordinary` / `orderable` (сортировка) / `multiparent` (только для Каталога, `n_n`). `maxDepth` ограничивает вложенность.",
  transitiveLinkages:
    "**transitiveLinkages** — Транзитивные связи через `joins`. Для поиска по атрибутам связи: `useForSearch: true` в linkage + `searchable: true` в атрибуте.",
  exchangeSettings:
    "**exchangeSettings** — Импорт/экспорт. `noCmsSynс` содержит кириллическую `с` (U+0441) — исторический артефакт системы.",
  uiRules:
    "**uiRules** — Условное скрытие, изменение стилей и доступности виджетов/групп/колонок. `effect`: `hidden`, `show`, `hiddenEmpty`, `readonly`, `editable`, `inherit`, `variant`.",
  uiPresets:
    "**uiPresets** — Именованные наборы CSS-свойств (`color`, `font-weight`, `background-color`, `collapsed`). Ссылаются из `uiRules.rule.widgets[].presets`.",
  medias:
    "**medias** — Иконки дизайн-системы. `type: icon_name`, `iconName: <ID>`.",
  accessRules:
    "**accessRules** — Права доступа: `create` / `edit` / `view` / `delete` / `launch`. `kind`: `permission`, `pass`, `condition`.",
  localizations:
    "**localizations** — Локализации по языкам. Ключи через `- key:`. `ordinal` — формы множественного числа.",
  permissions: "**permissions** — Разрешения (ссылаются из `accessRules`).",
};
