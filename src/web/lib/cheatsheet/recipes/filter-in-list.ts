import type { CheatsheetRecipe } from "../types";

export const filterInList: CheatsheetRecipe = {
  id: "filter-in-list",
  title: "Фильтрация в списке объектов",
  description: "Как включить фильтр по атрибутам и связанным сущностям",
  sections: ["views"],
  md: `
# Фильтрация в списке объектов

## Что делаем

В list-view включаем фильтр по атрибутам сущности и по атрибутам связанных сущностей.

## Шаги

1. Найдите view с \`type: list\` нужной сущности.
2. Добавьте \`table.filter\` с \`attributes\` и/или \`linkages\`.
3. Для каждого поля укажите \`attribute\` или \`linkage\`.

## Полный пример

\`\`\`yaml
views:
  - id: lists_incidents
    type: list
    source:
      type: operational
      entity: Incident
    table:
      columns:
        - id: subject
          attribute: incidentSubject
          label: Тема
      filter:
        attributes:
          type: specific
          use:
            - attribute: incidentSubject
            - attribute: severity
        linkages:
          type: specific
          use:
            - linkage: Incident_Ioc
              linkedEntity:
                - attribute: value
                - attribute: type
\`\`\`

## Варианты

- \`type: all\` — фильтр по всем атрибутам / связям (быстро, но пользователь видит много)
- \`type: specific\` — только перечисленные (рекомендуется для продакшена)

## Проверка

После сохранения откройте список — над таблицей появится иконка фильтра.
Если фильтр не работает — проверьте, что атрибуты из \`use[]\` реально существуют в сущности.
`,
};
