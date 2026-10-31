import type { CheatsheetSection } from "../types";

export const uiRules: CheatsheetSection = {
  id: "uiRules",
  label: "UI Rules",
  icon: "rule_folder",
  docsRef: "§ UI Rules — стр. 375–391",
  md: `
# UI Rules

## Назначение

Условное скрытие / изменение элементов интерфейса — по роли, статусу, значению другого поля.

## Обязательные поля

| Поле | Описание |
|---|---|
| \`id\` | Data ID |
| \`target\` | \`list_view\` / \`entity_view\` / \`entity_attribute\` |
| \`view\` | Представление, к которому применяется |
| \`condition\` | RQL-условие |
| \`rule.effect\` | \`hidden\` / \`show\` / \`readonly\` / \`editable\` / \`inherit\` / \`variant\` |

## Эффекты

| \`effect\` | Что делает |
|---|---|
| \`hidden\` | Скрыть элементы |
| \`show\` | Показать (перебивает \`hidden\`) |
| \`hiddenEmpty\` | Скрыть, если пусто |
| \`readonly\` | Только для чтения |
| \`editable\` | Разрешить редактирование |
| \`inherit\` | Наследовать от родителя |
| \`variant\` | Применить пресеты стилей |

## Пример: скрыть колонку в списке для не-админов

\`\`\`yaml
uiRules:
  - id: hide_salary_for_non_admin
    name: Скрыть зарплату
    target: list_view
    view: lists_employees
    condition: !rql NOT hasRole('admin')
    rule:
      effect: hidden
      columns:
        - column: salaryCol
\`\`\`

## Пример: скрыть виджет в карточке

\`\`\`yaml
uiRules:
  - id: hide_edit_button
    name: Скрыть кнопку редактирования
    target: entity_view
    view: viewEmployee
    condition: !rql employeeStatus = 'LOCKED'
    rule:
      effect: hidden
      widgets:
        - widget: buttons_editEmployee
\`\`\`

## Пример: только для чтения в определённом статусе

\`\`\`yaml
uiRules:
  - id: readonly_closed
    name: Заблокировать после закрытия
    target: entity_view
    view: viewIncident
    condition: !rql status = 'CLOSED'
    rule:
      effect: readonly
      widgets:
        - widget: editors_severity
        - widget: editors_owner
\`\`\`

## nested (для Array / Table)

\`\`\`yaml
uiRules:
  - id: hide_secret_column_in_table
    target: entity_attribute
    view: viewIncident
    condition: !rql incidentType = 'PUBLIC'
    rule:
      effect: hidden
      widgets:
        - widget: editors_artifactsTable
          nested:
            type: table
            attributes:
              - attribute: secretNotes
\`\`\`

## Пресеты стилей (variant)

\`\`\`yaml
uiPresets:
  - id: criticalRed
    description: Красный фон
    props:
      background-color: "#fee"
      color: "#c00"

uiRules:
  - id: highlight_critical
    target: entity_view
    view: viewIncident
    condition: !rql severity = 'CRITICAL'
    rule:
      effect: variant
      widgets:
        - widget: editors_severity
          presets:
            - criticalRed
\`\`\`

См. рецепт **Скрыть колонку таблицы по условию**.
`,
};
