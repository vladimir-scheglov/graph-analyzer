import type { CheatsheetSection } from "../types";

export const transitiveLinkages: CheatsheetSection = {
  id: "transitiveLinkages",
  label: "Транзитивные связи",
  icon: "conversion_path",
  docsRef: "§ Транзитивные связи — стр. 358–362",
  md: `
# Транзитивные связи (transitiveLinkages)

## Назначение

Показать данные через цепочку связей: Equipment → City → Office → Country.

## Обязательные поля

| Поле | Описание |
|---|---|
| \`id\` | Data ID |
| \`entity\` | Сущность-корень |
| \`joins[]\` | Цепочка связей |

## Поля joins

| Поле | Описание |
|---|---|
| \`id\` | ID соединения (уникален в дереве) |
| \`linkage\` | Ссылка на связь |
| \`side\` | Сторона связи (1 или 2) |
| \`search\` | Настройки поиска |
| \`joins\` | Следующий хоп (рекурсивно) |

## Пример: 2 хопа

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
            joins:
              - id: equipmentcityofficecountry
                linkage: OfficeToCountry
\`\`\`

## Использование в колонке списка

\`\`\`yaml
views:
  - id: EquipmentList
    type: list
    source:
      type: operational
      entity: Equipment
    table:
      columns:
        - id: office
          join: equipmentcityoffice
          attribute: Name
          label: Офис
\`\`\`

## Использование в фильтре

\`\`\`yaml
table:
  filter:
    linkages:
      type: specific
      use:
        - join: equipmentcityoffice
          linkedEntity:
            - attribute: Name
\`\`\`

## Виджет в карточке

\`\`\`yaml
widgets:
  - id: widget_office
    type: join
    joinId: equipmentcityoffice
    attribute: Name
    label: Офис
\`\`\`

## Поиск по узлу

\`\`\`yaml
joins:
  - id: equipmentcity
    linkage: EquipmentToCity
    search:
      enable: true
      mode: both   # entity | linkage | both
\`\`\`

См. рецепт **Транзитивная связь через 2 хопа**.
`,
};
