import type { CheatsheetRecipe } from "../types";

export const linkedObjectsGroups: CheatsheetRecipe = {
  id: "linked-objects-groups",
  title: "Сгруппированные связанные объекты",
  description:
    "Таблица со связанными объектами, сгруппированными по атрибутам с подсчётом уникальных записей",
  sections: ["widgets", "views", "actions"],
  md: `
# Сгруппированные связанные объекты

## Что делаем

В карточке инцидента — таблица со всеми индикаторами, сгруппированными по
\`(type, value)\`. В каждой группе — сколько объектов, и клик на число открывает
список.

## 1. Виджет \`linked_objects_groups\`

\`\`\`yaml
views:
  - id: viewIncident
    type: entity
    entity: Incident
    widgets:
      - id: widget_linkedIocs
        type: linked_objects_groups
        linkages:
          - linkage: Incident_Ioc
            side: 2
        groupingBy:
          - attribute: type
          - attribute: value
        control:
          type: table
        columns:
          - id: type
            attribute: type
            label: Тип
          - id: value
            attribute: value
            label: Значение
          - id: totalCount
            attribute: totalCount
            label: Инцидентов
        sortingBy:
          columns:
            - column: type
              sorting: sortByType
          default:
            column: type
            direction: asc
        paging:
          sizes: [10, 50, 100]
          defaultSize: 10
\`\`\`

**Что тут:**

- \`linkages[]\` — источники объектов. Одна или несколько связей.
- \`groupingBy[]\` — по каким атрибутам группировать. Это **обязательное** поле.
- \`columns[]\` — колонки. Допустимы только атрибуты из \`groupingBy\` + \`totalCount\`.
- \`control.type: table\` — единственное доступное значение (по умолчанию).
- \`totalCount\` — специальный атрибут: количество уникальных записей после группировки.

---

## 2. Клик по \`totalCount\`

Чтобы клик на количество открывал список — в \`open_list\`-действии
для каждой сущности нужно задать \`widgetId\`:

\`\`\`yaml
actions:
  - id: actions_openIncidentIocs
    name: Открыть индикаторы
    type: open_list
    view: lists_iocs
    entity: Incident
    linkage: Incident_Ioc
    side: 2
    widgetId: widget_linkedIocs       # ← ключевое
    page: current
\`\`\`

Без \`widgetId\` — \`totalCount\` будет некликабельным числом.

---

## 3. Транзитивные связи через \`joins\`

Если объекты связаны не напрямую, а через цепочку — используйте \`joins\`:

\`\`\`yaml
widgets:
  - id: widget_cityFromEquipment
    type: linked_objects_groups
    joins:
      - join: equipmentcityoffice
    groupingBy:
      - attribute: cityName
      - attribute: officeName
    columns:
      - id: cityName
        attribute: cityName
      - id: officeName
        attribute: officeName
      - id: totalCount
        attribute: totalCount
\`\`\`

\`join: <id>\` — это \`id\` из \`transitiveLinkages[].joins[].id\`.

---

## 4. Что важно

### \`linkages\` vs \`joins\`

- \`linkages[]\` — прямые связи. Формат \`{ linkage, side }\`.
- \`joins[]\` — транзитивные. Формат \`{ join }\` (просто id).
- На виджете — **одно из двух**, не оба сразу.

### \`side\`

- \`side: 1\` — показываем **один** объект (для \`1_1\` / \`1_n\`).
- \`side: 2\` — показываем **множество** (для \`1_n\` / \`n_n\`).
- Для симметричной направленной связи — обязателен.
- Для ненаправленной (\`n_n\` + \`undirected: true\`) — игнорируется.

### \`columns[]\`

- \`attribute\` — только атрибуты из \`groupingBy[]\` **или** \`totalCount\`.
- Нельзя «добавить колонку с атрибутом, которого нет в \`groupingBy\`» — это
  сломает группировку.
- Колонка \`totalCount\` — уникальный «виртуальный» атрибут.

### \`displayMode\` (для виджетов связи)

Если в виджете \`linkage\` (не \`linked_objects_groups\`) есть транзитивные колонки:

\`\`\`yaml
widgets:
  - id: widget_linkageWithJoin
    type: linkage
    linkage: EquipmentToCity
    side: 2
    control:
      type: table
      displayMode: grouped    # grouped (по умолчанию) | flat
      addLinksView: lists_cities
      columns:
        - id: name
          attribute: name
        - id: officeName
          join: equipmentcityoffice
          attribute: Name
\`\`\`

- \`grouped\` — все значения сгруппированы по первому звену цепочки.
- \`flat\` — все комбинации связанных сущностей в отдельных строках.

---

## 5. Полный пример

\`\`\`yaml
# Источники данных
entities:
  - id: Incident
    # ...
  - id: Ioc
    attributes:
      - id: type
        dataType: enumIocTypes
      - id: value
        dataType: String
  - id: Asset
    attributes:
      - id: hostname
        dataType: String

linkages:
  - id: Incident_Ioc
    side1: Incident
    side2: Ioc
    type: n_n
    nameFrom: { side1: Содержит, side2: Связан с }
  - id: Incident_Asset
    side1: Incident
    side2: Asset
    type: n_n
    nameFrom: { side1: Затрагивает, side2: Фигурирует в }

# Виджет
views:
  - id: viewIncident
    type: entity
    entity: Incident
    widgets:
      - id: widget_linkedObjects
        type: linked_objects_groups
        linkages:
          - linkage: Incident_Ioc
            side: 2
          - linkage: Incident_Asset
            side: 2
        groupingBy:
          - attribute: type
          - attribute: value
          - attribute: hostname
        columns:
          - id: type
            attribute: type
            label: Тип связи
          - id: value
            attribute: value
            label: Значение
          - id: hostname
            attribute: hostname
            label: Хост
          - id: totalCount
            attribute: totalCount
            label: Всего
        sortingBy:
          columns:
            - column: type
              sorting: sortByType
        paging:
          sizes: [20, 50]
          defaultSize: 20

# Действия с widgetId (для клика на totalCount)
actions:
  - id: actions_openLinkedIocs
    type: open_list
    view: lists_iocs
    entity: Incident
    linkage: Incident_Ioc
    side: 2
    widgetId: widget_linkedObjects
    page: current

  - id: actions_openLinkedAssets
    type: open_list
    view: lists_assets
    entity: Incident
    linkage: Incident_Asset
    side: 2
    widgetId: widget_linkedObjects
    page: current
\`\`\`

## Связанные секции

- **Виджеты** — \`linked_objects_groups\`, \`linkage\`, \`join\`
- **Действия** — \`open_list\` с \`widgetId\`
`,
};
