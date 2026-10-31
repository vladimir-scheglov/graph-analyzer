import type { CheatsheetRecipe } from "../types";

export const transitiveLinkage: CheatsheetRecipe = {
  id: "transitive-linkage",
  title: "Транзитивная связь через 2 хопа",
  description:
    "Показать в списке данные через цепочку: Equipment → City → Office",
  sections: ["views", "linkages"],
  md: `
# Транзитивная связь через 2 хопа

## Что делаем

В списке оборудования показать офис, в котором находится город оборудования. Цепочка: Equipment → City → Office.

## Шаги

1. Убедитесь, что есть связи \`EquipmentToCity\` и \`CityToOffice\`.
2. Опишите дерево в \`transitiveLinkages\`.
3. В list-view добавьте колонку с \`join\` + \`attribute\`.

## 1. Дерево транзитивных связей

\`\`\`yaml
transitiveLinkages:
  - id: EquipmentTree
    entity: Equipment
    joins:
      - id: equipmentcity
        linkage: EquipmentToCity
        joins:
          - id: equipmentcityoffice
            linkage: CityToOffice
\`\`\`

## 2. Колонка в списке

\`\`\`yaml
views:
  - id: EquipmentList
    type: list
    source:
      type: operational
      entity: Equipment
    table:
      columns:
        - id: name
          attribute: name
          label: Название
        - id: equipmentoffice
          join: equipmentcityoffice
          attribute: Name
          label: Офис
\`\`\`

## 3. Виджет транзитивной связи (в карточке)

\`\`\`yaml
views:
  - id: EquipmentCard
    type: entity
    entity: Equipment
    widgets:
      - id: widget_equipmentcityoffice
        type: join
        joinId: equipmentcityoffice
        attribute: Name
        label: Офис
    groups:
      - id: tabs_equipment
        type: tab
        components:
          - widget: widget_equipmentcityoffice
\`\`\`

## Правила

- \`join\` ссылается на \`id\` из \`transitiveLinkages[].joins[].id\`.
- Вложенность \`joins.joins\` — 1 уровень на каждый хоп.
- В фильтрах — \`filter.linkages.use[].join\`.
`,
};
