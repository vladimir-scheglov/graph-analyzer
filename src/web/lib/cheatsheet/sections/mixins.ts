import type { CheatsheetSection } from "../types";

export const mixins: CheatsheetSection = {
  id: "mixins",
  label: "Миксины",
  icon: "merge",
  docsRef: "§ Примеси — стр. 362–375",
  md: `
# Миксины

## Назначение

Миксин расширяет сущность данными и интерфейсом из другого домена — без дублирования кода.

Два типа:
- **type: linkage** — расширение через связанный объект (данные + действия в контексте примеси)
- **type: view** — расширение интерфейса (компоненты в контексте целевого объекта)

## Общие поля

| Поле | Тип | Описание |
|---|---|---|
| \`id\` | Data ID | Уникальный идентификатор |
| \`type\` | перечисление | \`linkage\` или \`view\` |
| \`entity\` | object / ref | Для linkage — \`{ from, to }\`, для view — целевая сущность |
| \`linkage\` | ref | Для type: linkage — ссылка на связь |
| \`views\` | массив | Подмешиваемые представления |
| \`weight\` | число | Приоритет (меньше = выше) |
| \`useForChild\` | boolean | Наследовать дочерним (по умолчанию \`true\`) |

## Пример: type linkage (данные из другого домена)

\`\`\`yaml
mixins:
  - id: incident_gossopka
    type: linkage
    entity:
      to: unit.example.com/Incident
      from: gossopka.example.com/GossopkaNotification
    linkage: Incident_Message_link
    views:
      - id: mixin_incident_tab
        type: tab
        to:
          tab: tabs_info
        change:
          add:
            components:
              - widget: gossopka.example.com/editors_message
\`\`\`

## Пример: type view (переиспользование UI без связи)

\`\`\`yaml
mixins:
  - id: audit_card_mixin
    type: view
    entity: unit.example.com/Incident
    views:
      - id: mixin_tab
        type: tab
        fromView: audit.example.com/audit_panel_view
        to:
          tab: tabs_info
        change:
          add:
            components:
              - block: audit.example.com/audit_info_block
\`\`\`

## change: что можно добавить

- \`components[]\` — виджеты и блоки (\`- widget:\`, \`- block:\`)
- \`tabs.tabs[]\` — вкладки (\`- tab:\`, \`label:\`)
- \`menu.menu[]\` — действия меню (\`- action:\`, \`label:\`)
- \`position\` — \`begin\` / \`after\` / \`end\`

## change: что можно удалить (type: view)

\`\`\`yaml
change:
  delete:
    components:
      - widget: editors_secret
    tabs:
      - tab: tabs_hidden
    columns:
      - column: secretCol
\`\`\`

## replace (type: view) — полная замена

\`\`\`yaml
replace:
  form: other.domain/replacement_form
\`\`\`

## Приоритеты

- Меньшее значение \`weight\` → применяется первым.
- При равных — сортировка по \`id\` (по алфавиту).
- При разных типах — \`type: view\` применяется раньше \`type: linkage\`.

## Наследование примеси

Если \`useForChild: true\` (по умолчанию), примесь автоматически применяется ко всем дочерним сущностям целевого объекта.

Отключить: \`useForChild: false\`.
`,
};
