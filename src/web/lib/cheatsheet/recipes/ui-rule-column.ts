import type { CheatsheetRecipe } from "../types";

export const uiRuleColumn: CheatsheetRecipe = {
  id: "ui-rule-column",
  title: "Скрыть колонку таблицы по условию",
  description: "Через uiRules: скрыть/показать колонку по роли или статусу",
  sections: ["uiRules", "views"],
  md: `
# Скрыть колонку таблицы по условию

## Что делаем

Скрываем колонку «Зарплата» от всех, кто не администратор.

## Шаги

1. Найдите list-view нужной сущности.
2. Создайте \`uiRules[]\` с \`target: list_view\`.
3. Укажите \`effect: hidden\` + \`columns[]\`.

## Пример

\`\`\`yaml
views:
  - id: lists_employees
    type: list
    source:
      type: operational
      entity: Employee
    table:
      columns:
        - id: name
          attribute: employeeName
          label: Имя
        - id: salary
          attribute: salary
          label: Зарплата
\`\`\`

\`\`\`yaml
uiRules:
  - id: hide_salary
    name: Скрыть зарплату
    target: list_view
    view: lists_employees
    condition: !rql NOT hasRole('admin')
    rule:
      effect: hidden
      columns:
        - column: salary
\`\`\`

## Как работает

- Колонка \`salary\` остаётся в описании таблицы.
- При открытии списка для пользователей без роли \`admin\` колонка не отображается.
- Для админов — видна.

## Варианты

- Скрыть по статусу сущности: \`@doc.status = 'CLOSED'\`.
- Скрыть по значению другой колонки: только через \`condition\` RQL.
- Скрыть не колонку, а виджет — \`target: entity_view\`, \`rule.widgets[]\`.

## Отладка

Если не срабатывает:
- Проверьте имя колонки (\`column:\` — это \`id\` столбца из \`table.columns\`).
- Проверьте роль в RQL: \`hasRole('admin')\`.
- Откройте линтер (Sonar) — правило \`uirules/unknown-column\` покажет опечатки.
`,
};
