import type { CheatsheetSection } from "../types";

export const menus: CheatsheetSection = {
  id: "menus",
  label: "Меню",
  icon: "menu",
  docsRef: "§ Меню домена — стр. 504–505",
  md: `
# Меню домена (menus)

## Назначение

Пункты левой панели навигации системы.

## Типы

| \`type\` | Назначение |
|---|---|
| \`root_group\` | Раздел с подразделами (раскрывающийся) |
| \`root_menu\` | Отдельный пункт без подразделов |

## Обязательные поля

| Поле | Описание |
|---|---|
| \`id\` | View ID |
| \`route\` | Путь в URL, уникален в системе |
| \`label\` | Отображаемое название |
| \`type\` | \`root_group\` или \`root_menu\` |
| \`placement\` | \`top\` (главное меню) или \`settings\` (Настройки) |

## Опциональные поля

- \`icon\` — ссылка на medias
- \`priority\` — ≥1000, больше = выше
- \`view\` — для \`root_menu\`
- \`items[]\` — для \`root_group\`

## Пример: корневая группа

\`\`\`yaml
menus:
  - id: menus_iocs
    route: /iocs
    label: Индикаторы компрометации
    type: root_group
    placement: top
    priority: 1000
    items:
      - id: IndicatorsMenu
        route: /iocs/indicators
        label: Индикаторы
        type: menu
        view: lists_iocs
        priority: 1000
      - id: SourcesMenu
        route: /iocs/sources
        label: Источники
        type: menu
        view: lists_iocSources
\`\`\`

## Пример: root_menu (один пункт)

\`\`\`yaml
menus:
  - id: audit_dashboard
    route: /audit
    label: Аудиты
    type: root_menu
    placement: top
    view: lists_audits
    priority: 1100
\`\`\`

## Как работает подсветка

Если открыть полноэкранную карточку (\`views[type: page]\`) с \`menuItem\` = id пункта меню, этот пункт подсветится в левой панели.
`,
};
